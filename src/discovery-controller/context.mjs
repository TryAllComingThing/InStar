import {fs,path,safe,hash,projectRoot,exists,json} from '../workflow-controller/files.mjs';
import {discoverSpecFiles} from '../openspec-min/src/utils/spec-discovery.js';
import {getDiscoveryInstructions} from '../openspec-min/src/discovery/instructions.js';
import {createHash} from 'node:crypto';
import {MarkdownParser} from '../openspec-min/src/diff/parsers/markdown-parser.js';
import {assertUniqueSpecNames} from '../openspec-min/src/discovery/validate.js';
import {readBoundedVerified} from '../shared/bounded-input.mjs';
import {readDirectoryVerified,sameDirectoryIdentity,lstatVerified,pathExistsVerified} from '../shared/path-safety.mjs';

const excludedDirectories = new Set(['node_modules','vendor']);
const rootGeneratedDirectories = new Set(['dist','build','coverage','openspec','reports','logs']);
const textExtension = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?|css|scss|sass|less|json|ya?ml|toml|md|mdx|graphql|gql|sql|py|go|rs|java|kt|rb|php|cs|sh)$/i;
const excludedFiles = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.min\.[cm]?js|.*\.map|credentials(?:\.[^/]*)?|secrets?(?:\.[^/]*)?)$/i;
const limits = {entries:30000,files:10000,fileBytes:1024*1024,totalBytes:64*1024*1024};
const baselineFileBytes = 4*1024*1024;
const baselineScanBytes = 64*1024*1024;

export function sourcePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.isAbsolute(value) || value.split('/').some(p => p === '..' || !p)) throw Error('Source paths must be project-relative POSIX paths');
  const normalized = path.posix.normalize(value);
  if (normalized !== '.' && normalized.split('/').some(part => part.startsWith('.') || excludedDirectories.has(part))) throw Error(`Excluded source path: ${value}`);
  return normalized;
}

export async function discoveryContext(input) {
  const root = await projectRoot(input.project,{initialized:false});
  if (await pathExistsVerified(root,'.workflow/pending.json')) throw Error('Recovery required before discovery; use discovery action recover');
  const rawScopes = input.scopes ?? ['.'];
  if (!Array.isArray(rawScopes) || !rawScopes.length) throw Error('scopes must be a non-empty array');
  const scopes = [...new Set(rawScopes.map(sourcePath))].sort();
  const inventory = Object.create(null), omitted = [];
  try { const stat=await lstatVerified(root,'planning'); if(stat.isDirectory()) omitted.push({path:'planning',reason:'controller-managed planning area; baseline specs and workflow summaries are indexed separately'}); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  let entries = 0, bytes = 0;
  async function walk(relative, explicit=false) {
    if (++entries > limits.entries) throw Error('Discovery entry limit reached; use narrower scopes');
    const stat = await lstatVerified(root,relative);
    if (stat.isSymbolicLink()) throw Error(`Symlink source is unsupported: ${relative}`);
    if (stat.isDirectory()) {
      const items = (await readDirectoryVerified(root, relative || '.', {maxEntries:10000, label: relative || '.'})).sort((a,b)=>a.name.localeCompare(b.name));
      for (const item of items) {
        const child = relative === '.' ? item.name : `${relative}/${item.name}`;
        // Controller-owned artifacts are not source and may appear when locking.
        if (relative === '.' && item.name === '.workflow') continue;
        if (relative === '.' && item.name === 'planning') continue;
        // Generated folders at the project root are omitted from automatic walks.
        // Explicitly selecting one is allowed (for example a real business reports/ module).
        if (relative === '.' && rootGeneratedDirectories.has(item.name)) { omitted.push({path:child,reason:'root build/planning output; use an explicit scope if this is source'}); continue; }
        if (item.name.startsWith('.') || excludedDirectories.has(item.name) || item.isSymbolicLink()) { omitted.push({path:child,reason:item.isSymbolicLink()?'symlink':'excluded directory or hidden file'}); continue; }
        await walk(child);
      }
      const final = await lstatVerified(root,relative);
      if(final.isSymbolicLink()||!final.isDirectory()||!sameDirectoryIdentity(stat,final))throw Error(`Directory changed while scanning discovery source: ${relative || '.'}`);
      return;
    }
    if (!stat.isFile() || !textExtension.test(relative) || excludedFiles.test(relative)) {
      if (explicit) throw Error(`Unsupported source file: ${relative}`);
      omitted.push({path:relative,reason:'non-source or unsupported file'}); return;
    }
    if (Object.hasOwn(inventory,relative)) return;
    if (stat.size > limits.fileBytes) { omitted.push({path:relative,reason:'file exceeds 1 MiB; inspect separately'}); return; }
    const content = await readBoundedVerified(root,relative,limits.fileBytes);
    if (content.includes('\0')) { omitted.push({path:relative,reason:'binary file'}); return; }
    bytes += Buffer.byteLength(content);
    if (Object.keys(inventory).length >= limits.files || bytes > limits.totalBytes) throw Error('Discovery size limit reached; use narrower scopes');
    inventory[relative] = {hash:createHash('sha256').update(content).digest('hex'),lines:content.replace(/\r\n?/g,'\n').split('\n').length,bytes:Buffer.byteLength(content)};
  }
  for (const scope of scopes) await walk(scope,true);
  // Ancestor instructions and root manifests remain relevant for scoped discovery.
  const extra = new Set(['AGENTS.md','package.json']);
  for (const scope of scopes) {
    let parent = scope;
    while (parent !== '.') { extra.add(`${parent}/AGENTS.md`); parent = path.posix.dirname(parent); }
  }
  for (const file of extra) {
    try { if (await pathExistsVerified(root,file)) await walk(file); }
    catch(error) { if (error.code !== 'ENOTDIR') throw error; }
  }
  const baseline = Object.create(null), baselineIndex = Object.create(null);
  for (const directory of ['planning','planning/specs']) {
    try { const stat=await lstatVerified(root,directory); if(!stat.isDirectory()) throw Error(`Unsafe baseline directory: ${directory}`); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  const baselineFiles = await discoverSpecFiles(safe(root,'planning/specs'));
  let baselineBytes = 0;
  const fileBytes = new Map();
  for (const item of baselineFiles) {
    const relative=`planning/specs/${item.id}/spec.md`, stat=await lstatVerified(root,relative);
    if(stat.isSymbolicLink()||!stat.isFile())throw Error(`Unsafe baseline spec: ${relative}`);
    if(stat.size>baselineFileBytes)throw Error(`Baseline spec exceeds 4 MiB: ${relative}`);
    fileBytes.set(item.id,stat.size);baselineBytes+=stat.size;
  }
  if(baselineBytes>baselineScanBytes)throw Error('Baseline scan exceeds 64 MiB; repair or split the baseline before discovery');
  let selectedCapabilities;
  if (input.baselineCapabilities !== undefined) {
    if (!Array.isArray(input.baselineCapabilities) || input.baselineCapabilities.some(id=>typeof id!=='string')) throw Error('baselineCapabilities must be an array of capability paths');
    selectedCapabilities = [...new Set(input.baselineCapabilities)];
    for (const id of selectedCapabilities) if (!fileBytes.has(id)) throw Error(`Unknown existing capability: ${id}`);
  } else if (baselineBytes <= 4*1024*1024) selectedCapabilities = baselineFiles.map(item=>item.id);
  else {
    const pathParts = new Set(scopes.flatMap(scope=>scope.split('/')).map(part=>part.replace(/\.[^.]+$/,'').toLowerCase()));
    selectedCapabilities = baselineFiles.map(item=>item.id).filter(id=>id.split('/').some(part=>pathParts.has(part.toLowerCase())));
  }
  const selectedBytes = selectedCapabilities.reduce((sum,id)=>sum+fileBytes.get(id),0);
  if (selectedBytes > 4*1024*1024) throw Error('Selected baseline exceeds 4 MiB; narrow scopes or specify fewer baselineCapabilities');
  const selected = new Set(selectedCapabilities);
  const baselineIssues=[];
  for (const {id,specFile} of baselineFiles) {
    const relative=baselineIndex[id]?.path??`planning/specs/${id}/spec.md`, fileStat=await lstatVerified(root,relative);
    if(fileStat.isSymbolicLink()||!fileStat.isFile()) throw Error(`Unsafe baseline spec: ${relative}`);
    const content=await readBoundedVerified(root,relative,baselineFileBytes);
    let requirements=[], invalid;
    try { requirements=assertUniqueSpecNames(new MarkdownParser(content).parseSpec(id)).requirements.map(requirement=>requirement.name); }
    catch(error) { invalid=error.message; baselineIssues.push({path:relative,error:error.message}); }
    baselineIndex[id] = {path:relative,hash:hash(content),requirements,...(invalid?{invalid}:{})};
    if(selected.has(id)) baseline[id]={path:relative,hash:baselineIndex[id].hash,document:content,...(invalid?{invalid}:{})};
  }
  const activeChanges = [];
  try {
    const entries=await readDirectoryVerified(root,'planning/workflows',{maxEntries:10000,label:'planning/workflows'});
    for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const relative = `planning/workflows/${entry.name}`;
      const state = await json(root,relative);
      activeChanges.push({changeId:state.changeId??entry.name.slice(0,-5),stage:state.stage??'unknown',status:state.status??'unknown',pendingApproval:state.pendingApproval??null});
    }
  } catch(error) { if(error.code!=='ENOENT') throw error; }
  const instruction = getDiscoveryInstructions();
  const snapshot = {project:root,scopes,inventory,omitted,baselineIndex,baseline,baselineIssues,activeChanges};
  return {...snapshot,contextHash:hash(snapshot),instruction,limits,
    note:'Inventory is not evidence of semantic review. Read relevant source files and tests; report unreviewed files. Baseline contains complete documents only for selected capabilities; inspect baselineIndex and request baselineCapabilities for relevant full documents. Active workflow states are summaries; do not assume draft implementation is an approved baseline. The CLI does not invoke a model.'};
}

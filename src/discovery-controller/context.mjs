import {fs,path,safe,read,hash,projectRoot,exists} from '../workflow-controller/files.mjs';
import {discoverSpecFiles} from '../openspec-min/src/utils/spec-discovery.js';
import {getDiscoveryInstructions} from '../openspec-min/src/discovery/instructions.js';
import {createHash} from 'node:crypto';
import {MarkdownParser} from '../openspec-min/src/diff/parsers/markdown-parser.js';
import {assertUniqueSpecNames} from '../openspec-min/src/discovery/validate.js';

const excludedDirectories = new Set(['node_modules','vendor']);
const rootGeneratedDirectories = new Set(['dist','build','coverage','openspec','reports','logs']);
const textExtension = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?|css|scss|sass|less|json|ya?ml|toml|md|mdx|graphql|gql|sql|py|go|rs|java|kt|rb|php|cs|sh)$/i;
const excludedFiles = /(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.min\.[cm]?js|.*\.map|credentials(?:\.[^/]*)?|secrets?(?:\.[^/]*)?)$/i;
const limits = {entries:30000,files:10000,fileBytes:1024*1024,totalBytes:64*1024*1024};

export function sourcePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.isAbsolute(value) || value.split('/').some(p => p === '..' || !p)) throw Error('Source paths must be project-relative POSIX paths');
  const normalized = path.posix.normalize(value);
  if (normalized !== '.' && normalized.split('/').some(part => part.startsWith('.') || excludedDirectories.has(part))) throw Error(`Excluded source path: ${value}`);
  return normalized;
}

export async function discoveryContext(input) {
  const root = await projectRoot(input.project,{initialized:false});
  if (await exists(safe(root,'.workflow/pending.json'))) throw Error('Recovery required before discovery; use discovery action recover');
  const rawScopes = input.scopes ?? ['.'];
  if (!Array.isArray(rawScopes) || !rawScopes.length) throw Error('scopes must be a non-empty array');
  const scopes = [...new Set(rawScopes.map(sourcePath))].sort();
  const inventory = Object.create(null), omitted = [];
  try { const stat=await fs.lstat(safe(root,'planning')); if(stat.isDirectory()) omitted.push({path:'planning',reason:'controller-managed planning area; baseline specs and workflow summaries are indexed separately'}); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  let entries = 0, bytes = 0;
  async function walk(relative, explicit=false) {
    if (++entries > limits.entries) throw Error('Discovery entry limit reached; use narrower scopes');
    const absolute = safe(root,relative);
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) throw Error(`Symlink source is unsupported: ${relative}`);
    if (stat.isDirectory()) {
      for (const item of (await fs.readdir(absolute,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
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
      return;
    }
    if (!stat.isFile() || !textExtension.test(relative) || excludedFiles.test(relative)) {
      if (explicit) throw Error(`Unsupported source file: ${relative}`);
      omitted.push({path:relative,reason:'non-source or unsupported file'}); return;
    }
    if (Object.hasOwn(inventory,relative)) return;
    if (stat.size > limits.fileBytes) { omitted.push({path:relative,reason:'file exceeds 1 MiB; inspect separately'}); return; }
    const content = await read(root,relative);
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
    try { if (await exists(safe(root,file))) await walk(file); }
    catch(error) { if (error.code !== 'ENOTDIR') throw error; }
  }
  const baseline = Object.create(null), baselineIndex = Object.create(null);
  const planningDir = safe(root,'planning'), specsDir = safe(root,'planning/specs');
  for (const directory of [planningDir,specsDir]) {
    try { const stat=await fs.lstat(directory); if(stat.isSymbolicLink()||!stat.isDirectory()) throw Error(`Unsafe baseline directory: ${path.relative(root,directory)}`); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
  }
  const baselineFiles = await discoverSpecFiles(safe(root,'planning/specs'));
  let baselineBytes = 0;
  const fileBytes = new Map();
  for (const item of baselineFiles) { const size=(await fs.stat(item.specFile)).size; fileBytes.set(item.id,size); baselineBytes+=size; }
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
    const relative=`planning/specs/${id}/spec.md`, fileStat=await fs.lstat(specFile);
    if(fileStat.isSymbolicLink()||!fileStat.isFile()) throw Error(`Unsafe baseline spec: ${relative}`);
    const content=await fs.readFile(specFile,'utf8');
    let requirements=[], invalid;
    try { requirements=assertUniqueSpecNames(new MarkdownParser(content).parseSpec(id)).requirements.map(requirement=>requirement.name); }
    catch(error) { invalid=error.message; baselineIssues.push({path:relative,error:error.message}); }
    baselineIndex[id] = {path:relative,hash:hash(content),requirements,...(invalid?{invalid}:{})};
    if(selected.has(id)) baseline[id]={path:relative,hash:baselineIndex[id].hash,document:content,...(invalid?{invalid}:{})};
  }
  const activeChanges = [];
  const workflowDir = safe(root,'planning/workflows');
  try {
    const stat = await fs.lstat(workflowDir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Unsafe planning/workflows directory');
    for (const entry of (await fs.readdir(workflowDir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const relative = `planning/workflows/${entry.name}`, fileStat = await fs.lstat(safe(root,relative));
      if (fileStat.isSymbolicLink()) throw Error(`Symlink workflow state is not allowed: ${relative}`);
      const state = JSON.parse(await read(root,relative));
      activeChanges.push({changeId:state.changeId??entry.name.slice(0,-5),stage:state.stage??'unknown',status:state.status??'unknown',pendingApproval:state.pendingApproval??null});
    }
  } catch(error) { if(error.code!=='ENOENT') throw error; }
  const instruction = getDiscoveryInstructions();
  const snapshot = {project:root,scopes,inventory,omitted,baselineIndex,baseline,baselineIssues,activeChanges};
  return {...snapshot,contextHash:hash(snapshot),instruction,limits,
    note:'Inventory is not evidence of semantic review. Read relevant source files and tests; report unreviewed files. Baseline contains complete documents only for selected capabilities; inspect baselineIndex and request baselineCapabilities for relevant full documents. Active workflow states are summaries; do not assume draft implementation is an approved baseline. The CLI does not invoke a model.'};
}

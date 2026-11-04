import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
const standardFile = /\.(?:md|mdx|json|ya?ml)$/i;
const excludedSegments = new Set(['.git','node_modules','dist','build','coverage','.workflow','.instar','reports','logs','planning','vendor','.next','.nuxt']);
const excludedFiles = new Set(['package-lock.json','yarn.lock','pnpm-lock.yaml']);
const limits = {files:200,bytes:512*1024,fingerprintEntries:200};

function normalizedPath(value,label='path'){
  if(typeof value!=='string'||!value.trim())throw Error(`${label} must be a non-empty project-relative path`);
  const relative=value.trim().replaceAll('\\','/').replace(/^\.\//,'');
  if(relative.startsWith('/')||relative.split('/').some(part=>!part||part==='.'||part==='..'))throw Error(`${label} must be a safe project-relative path`);
  return relative;
}

function stringList(value,label,max=30){
  if(value===undefined||value===null)return [];
  const values=Array.isArray(value)?value:[value];
  if(!values.length)return [];
  if(values.length>max)throw Error(`${label} must contain 1-${max} entries`);
  return [...new Set(values.map(item=>normalizedPath(item,label)))];
}

function safePath(root,relative){
  const resolved=path.resolve(root,relative);
  if(resolved!==root&&!resolved.startsWith(root+path.sep))throw Error(`Path escapes project: ${relative}`);
  return resolved;
}

async function regularFile(root,relative,maxBytes=limits.bytes){
  const absolute=safePath(root,relative);
  let current=root;
  for(const part of relative.split('/')){
    current=path.join(current,part);
    const stat=await fs.lstat(current);
    if(stat.isSymbolicLink())throw Error(`Standards symlink is not allowed: ${relative}`);
    if(current!==absolute&&!stat.isDirectory())throw Error(`Standards parent is not a directory: ${relative}`);
    if(current===absolute&&!stat.isFile())throw Error(`Standards source must be a regular file: ${relative}`);
  }
  const stat=await fs.stat(absolute);
  if(stat.size>maxBytes)throw Error(`Standards source exceeds ${maxBytes} bytes: ${relative}`);
  return fs.readFile(absolute,'utf8');
}

async function pathExists(root,relative){
  try{return await fs.lstat(safePath(root,relative));}catch(error){if(error.code==='ENOENT')return null;throw error;}
}

function ignoredPath(relative){
  const parts=relative.split('/');
  return parts.some(part=>excludedSegments.has(part))||excludedFiles.has(parts.at(-1))||parts.some(part=>part==='.ssh'||part==='.aws'||part.startsWith('.env'));
}

async function walk(root,relative,destination,state){
  if(state.files.size>=limits.files||state.bytes>=limits.bytes){state.truncated=true;return;}
  const stat=await pathExists(root,relative);
  if(!stat)return;
  if(stat.isSymbolicLink())throw Error(`Standards symlink is not allowed: ${relative}`);
  if(stat.isDirectory()){
    const depth=relative.split('/').length;
    if(depth>10){state.omitted.push({path:relative,reason:'depth-limit'});return;}
    for(const entry of (await fs.readdir(safePath(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const child=`${relative}/${entry.name}`;
      if(ignoredPath(child))continue;
      if(entry.isSymbolicLink())throw Error(`Standards symlink is not allowed: ${child}`);
      if(entry.isDirectory())await walk(root,child,destination,state);
      else if(entry.isFile()&&standardFile.test(entry.name)&&!ignoredPath(child)){
        if(state.files.size>=limits.files||state.bytes>=limits.bytes){state.truncated=true;break;}
        await addFile(root,child,destination,state);
      }
    }
    return;
  }
  if(!stat.isFile()||!standardFile.test(relative))return;
  await addFile(root,relative,destination,state);
}

async function addFile(root,relative,destination,state){
  if(state.files.has(relative))return;
  const body=await regularFile(root,relative),bytes=Buffer.byteLength(body);
  if(state.bytes+bytes>limits.bytes){state.truncated=true;state.omitted.push({path:relative,reason:'byte-limit'});return;}
  state.bytes+=bytes;state.files.set(relative,{path:relative,bytes,hash:digest(body)});
  destination.push(relative);
}

function globRegex(pattern){
  let source='';
  for(let index=0;index<pattern.length;index++){
    const char=pattern[index],next=pattern[index+1];
    if(char==='*'&&next==='*'&&pattern[index+2]==='/'){source+='(?:.*/)?';index+=2;continue;}
    if(char==='*'&&next==='*'){source+='.*';index++;continue;}
    if(char==='*'){source+='[^/]*';continue;}
    if(char==='?'){source+='[^/]';continue;}
    source+=/[\^$+?.()|{}[\]\\]/.test(char)?`\\${char}`:char;
  }
  return new RegExp(`^${source}$`,'i');
}

export function matchesStandardPath(pattern,file){
  return globRegex(pattern).test(file.replaceAll('\\','/'));
}

function validateManifestEntry(entry,index){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error(`Project standards entry ${index} must be an object`);
  const id=typeof entry.id==='string'?entry.id.trim():'';
  if(!/^[A-Za-z][A-Za-z0-9_.:-]{1,159}$/.test(id))throw Error(`Invalid project standards rule id: ${id||`entry ${index}`}`);
  const relative=normalizedPath(entry.path,`${id}.path`);
  const appliesTo=Array.isArray(entry.appliesTo)&&entry.appliesTo.length?entry.appliesTo:[];
  if(appliesTo.length>30||appliesTo.some(pattern=>typeof pattern!=='string'||!pattern.trim()||pattern.includes('..')||pattern.startsWith('/')))throw Error(`Invalid appliesTo for project standard ${id}`);
  const ruleIds=(value,label)=>{
    if(value===undefined||value===null)return [];
    if(!Array.isArray(value)||value.length>20)throw Error(`Project standard ${id||index} ${label} must contain 0-20 rule IDs`);
    const result=[...new Set(value.map(item=>typeof item==='string'?item.trim():''))];
    if(result.some(item=>!item||!/^[A-Za-z][A-Za-z0-9_.:-]{1,159}$/.test(item)))throw Error(`Project standard ${id||index} ${label} contains an invalid rule ID`);
    if(result.includes(id))throw Error(`Project standard ${id} cannot ${label} itself`);
    return result;
  };
  return {
    id,
    path:relative,
    mandatory:entry.mandatory===true||entry.always===true,
    appliesTo,
    summary:typeof entry.summary==='string'&&entry.summary.trim()?entry.summary.trim().slice(0,500):id,
    title:typeof entry.title==='string'&&entry.title.trim()?entry.title.trim().slice(0,160):id,
    owner:typeof entry.owner==='string'&&entry.owner.trim()?entry.owner.trim().slice(0,120):null,
    version:typeof entry.version==='string'&&entry.version.trim()?entry.version.trim().slice(0,80):null,
    supersedes:ruleIds(entry.supersedes,'supersedes'),
    conflictsWith:ruleIds(entry.conflictsWith,'conflictsWith'),
  };
}

async function readManifest(root,manifestPath,state){
  const text=await regularFile(root,manifestPath);
  let data;
  try{data=JSON.parse(text);}catch(error){throw Error(`Invalid project standards manifest ${manifestPath}: ${error.message}`);}
  if(data?.schemaVersion!==1||!Array.isArray(data.entries)||!data.entries.length||data.entries.length>200)throw Error(`Project standards manifest ${manifestPath} must use schemaVersion 1 with 1-200 entries`);
  const entries=data.entries.map(validateManifestEntry),ids=new Set();
  for(const entry of entries){if(ids.has(entry.id))throw Error(`Duplicate project standards rule id: ${entry.id}`);ids.add(entry.id);}
  for(const entry of entries)for(const reference of [...entry.supersedes,...entry.conflictsWith])if(!ids.has(reference))throw Error(`Project standard ${entry.id} references unknown rule: ${reference}`);
  state.manifestPresent=true;state.manifestPath=manifestPath;state.manifestFingerprint=digest(text);
  return entries;
}

export async function loadProjectStandards(root,configuredPaths=[]){
  const configured=stringList(configuredPaths,'context.standards',20);
  const roots=[];
  if(await pathExists(root,'standards'))roots.push('standards');
  for(const item of configured)if(!roots.includes(item))roots.push(item);
  const state={files:new Map(),bytes:0,truncated:false,omitted:[],manifestPresent:false,manifestPath:null,manifestFingerprint:null};
  const discovered=[];
  for(const item of roots)await walk(root,item,discovered,state);
  let manifest=null;
  for(const candidate of [...roots.map(item=>`${item}/index.json`),...discovered.filter(file=>file.endsWith('/index.json')||file==='index.json')]){
    if(state.files.has(candidate)){manifest=await readManifest(root,candidate,state);break;}
  }
  let entries;
  if(manifest){
    entries=[];
    for(const item of manifest){
      if(!state.files.has(item.path)){
        const stat=await pathExists(root,item.path);
        if(!stat||!stat.isFile()||stat.isSymbolicLink())throw Error(`Project standards manifest references an unavailable regular file: ${item.path}`);
        await addFile(root,item.path,discovered,state);
      }
      entries.push({...item,documentHash:state.files.get(item.path)?.hash||null,bytes:state.files.get(item.path)?.bytes||0});
    }
  }else{
    entries=[...state.files.values()].sort((left,right)=>left.path.localeCompare(right.path)).map(file=>({
      id:`STANDARD:${file.path}`,
      path:file.path,
      mandatory:false,
      appliesTo:[],
      summary:`Project standard: ${file.path}`,
      title:file.path,
      owner:null,
      version:null,
      documentHash:file.hash,
      bytes:file.bytes,
    }));
  }
  const fullFingerprint=digest(JSON.stringify({manifest:state.manifestFingerprint,files:[...state.files.values()].sort((a,b)=>a.path.localeCompare(b.path))}));
  return {
    schemaVersion:1,
    configured,
    roots,
    manifestPresent:state.manifestPresent,
    manifestPath:state.manifestPath,
    manifestFingerprint:state.manifestFingerprint,
    fingerprint:fullFingerprint,
    files:[...state.files.values()].sort((left,right)=>left.path.localeCompare(right.path)),
    entries,
    truncated:state.truncated,
    omitted:state.omitted,
    limits,
  };
}

export function applicableProjectStandards(catalog,paths=[]){
  const normalized=[...new Set((Array.isArray(paths)?paths:[]).map(item=>String(item).replaceAll('\\','/')))];
 const unknownEntries=[];
  const entries=catalog.entries.filter(entry=>{
  if(!entry.appliesTo.length)return true;
  if(!normalized.length){unknownEntries.push(entry);return false;}
    return entry.appliesTo.some(pattern=>normalized.some(file=>matchesStandardPath(pattern,file)));
  });
  const byId=new Map(entries.map(entry=>[entry.id,entry])),conflicts=[],seen=new Set();
  const addConflict=(left,right)=>{
   const pair=[left.id,right.id].sort(),key=pair.join('|');
   if(seen.has(key))return;
   seen.add(key);
   const leftWins=left.supersedes.includes(right.id),rightWins=right.supersedes.includes(left.id);
   const status=leftWins!==rightWins?'RESOLVED':'HUMAN_DECISION_REQUIRED';
   conflicts.push({
    id:key,
    entries:pair.map(id=>({id,path:byId.get(id).path,mandatory:byId.get(id).mandatory,owner:byId.get(id).owner,version:byId.get(id).version})),
    status,
    ...(leftWins!==rightWins?{winnerId:leftWins?left.id:right.id}:{}),
    resolution:leftWins!==rightWins
      ? `${(leftWins?left.id:right.id)} explicitly supersedes ${(leftWins?right.id:left.id)} in the project standards manifest`
      : 'Two applicable project rules declare a conflict. The project owner must reconcile them or declare `supersedes` in standards/index.json; do not choose silently.',
   });
  };
  for(const entry of entries){
   for(const id of entry.conflictsWith||[]){const other=byId.get(id);if(other)addConflict(entry,other);}
   for(const id of entry.supersedes||[]){const other=byId.get(id);if(other)addConflict(entry,other);}
  }
  const unresolved=conflicts.filter(item=>item.status!=='RESOLVED');
  const fingerprint=digest(JSON.stringify({entries:entries.map(entry=>({id:entry.id,path:entry.path,mandatory:entry.mandatory,documentHash:entry.documentHash,supersedes:entry.supersedes||[],conflictsWith:entry.conflictsWith||[]})).sort((left,right)=>left.id.localeCompare(right.id))}));
 return {
  schemaVersion:1,
  entries,
  mandatoryEntries:entries.filter(entry=>entry.mandatory),
  unknownEntries,
  conflicts,
  conflictStatus:conflicts.length?unresolved.length?'HUMAN_DECISION_REQUIRED':'RESOLVED':'NONE',
  resolution:'Project-owned standards take precedence over InStar advisory references. Within project standards, explicit conflicts require owner reconciliation or a declared supersedes edge.',
  status:unresolved.length?'CONFLICT':unknownEntries.some(entry=>entry.mandatory)?'UNKNOWN':'PASS',
  fingerprint,
 };
}

function section(document){
  const heading=/^#{2,4}\s+Compliance Matrix\s*$/im.exec(document);
  if(!heading)return null;
  const start=heading.index+heading[0].length;
  const rest=document.slice(start);
  const next=/\n#{1,4}\s+\S[^\n]*\n/.exec(rest);
  return rest.slice(0,next?next.index:rest.length);
}

function tableRows(text){
  const rows=[];
  for(const line of text.split(/\r?\n/)){
    if(!/^\s*\|/.test(line))continue;
    const cells=line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(cell=>cell.trim().replace(/^`|`$/g,''));
    if(cells.every(cell=>/^:?-{3,}:?$/.test(cell)))continue;
    rows.push(cells);
  }
  return rows;
}

export function validateComplianceMatrix(document,mandatoryEntries=[]){
  if(!Array.isArray(mandatoryEntries)||!mandatoryEntries.length)return {status:'NOT_REQUIRED',required:[],present:[]};
  const body=section(document);
  if(!body)throw Error('Technical design must include a Compliance Matrix section for mandatory project standards');
  const rows=tableRows(body);
  if(rows.length<2)throw Error('Compliance Matrix must contain a header and at least one rule row');
  const headers=rows[0].map(item=>item.toLowerCase());
  const requiredHeaders=['rule','source','status','evidence'];
  for(const header of requiredHeaders)if(!headers.includes(header))throw Error(`Compliance Matrix must include a ${header} column`);
  const index=Object.fromEntries(requiredHeaders.map(header=>[header,headers.indexOf(header)]));
  const seen=new Set(),present=[];
  for(const row of rows.slice(1)){
    const rule=String(row[index.rule]||'').trim();
    if(!rule)continue;
    seen.add(rule);present.push({rule,source:row[index.source]||'',status:String(row[index.status]||'').trim().toUpperCase(),evidence:row[index.evidence]||''});
  }
  for(const entry of mandatoryEntries){
    const row=present.find(item=>item.rule===entry.id);
    if(!row)throw Error(`Compliance Matrix is missing mandatory project standard: ${entry.id}`);
    if(!['PASS','WARN','NA'].includes(row.status))throw Error(`Compliance Matrix status for ${entry.id} must be PASS, WARN or NA`);
    if(!row.source.trim()||!row.evidence.trim())throw Error(`Compliance Matrix ${entry.id} requires source and evidence`);
    if(!row.source.includes(entry.path)&&!row.source.includes(entry.id))throw Error(`Compliance Matrix source for ${entry.id} must identify ${entry.path}`);
  }
  return {status:present.some(item=>item.status==='WARN'||item.status==='NA')?'WARN':'PASS',required:mandatoryEntries.map(entry=>entry.id),present};
}

export function validateStandardsReferences(entries=[],references){
  const required=Array.isArray(entries)?entries.filter(entry=>entry?.mandatory):[];
  if(!required.length)return {status:'NOT_REQUIRED',required:[],present:[]};
  if(!Array.isArray(references))throw Error('Review standardsReferences must list every applicable mandatory project standard');
  const allowed=new Set(required.map(entry=>entry.id)),present=[],seen=new Set();
  for(const reference of references){
    if(!reference||typeof reference!=='object'||Array.isArray(reference))throw Error('Each standardsReferences entry must be an object');
    const id=typeof reference.id==='string'?reference.id.trim():'';
    if(!allowed.has(id))throw Error(`Unknown or inapplicable project standard reference: ${id||'<empty>'}`);
    if(seen.has(id))throw Error(`Duplicate project standard reference: ${id}`);
    seen.add(id);
    const status=typeof reference.status==='string'?reference.status.trim().toUpperCase():'';
    if(!['PASS','WARN','NA'].includes(status))throw Error(`Project standard ${id} status must be PASS, WARN or NA`);
    const evidence=reference.evidence;
    const note=typeof evidence==='string'?evidence.trim():typeof evidence?.note==='string'?evidence.note.trim():'';
    if(!note)throw Error(`Project standard ${id} requires evidence`);
    present.push({id,status,evidence});
  }
  for(const entry of required)if(!seen.has(entry.id))throw Error(`Review is missing applicable mandatory project standard: ${entry.id}`);
  return {status:present.some(item=>item.status==='WARN'||item.status==='NA')?'WARN':'PASS',required:required.map(entry=>entry.id),present};
}

export function standardsComplianceTemplate(entries=[]){
  const lines=['## Compliance Matrix','','| Rule | Source | Status | Evidence |','| --- | --- | --- | --- |'];
  for(const entry of entries)lines.push(`| \`${entry.id}\` | \`${entry.path}\` | PASS | Cite the design decision and implementation evidence |`);
  return lines.join('\n');
}

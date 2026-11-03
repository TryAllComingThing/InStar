import {promises as fs,constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

export const SOURCE_SNAPSHOT_SCHEMA_VERSION=2;
const MAX_FILES=50000;
const MAX_BYTES=512*1024*1024;

const dependencyDirectories=new Set(['node_modules','.venv','venv','virtualenv','.tox','.nox','.direnv','vendor']);
const generatedDirectories=new Set(['dist','build','coverage','.next','.nuxt','.cache','.turbo','.vite','.parcel-cache','htmlcov','target','out','__pycache__','.pytest_cache','.ruff_cache','.mypy_cache','.pyre','.hypothesis']);
const runtimeDirectories=new Set(['.git','.workflow','reports','logs','planning']);
const osMetadata=new Set(['.DS_Store','Thumbs.db','desktop.ini']);
const rootStatePrefixes=['docs/prd/','.instar/session/'];

const normalize=relative=>String(relative||'').replaceAll('\\','/').replace(/^\.\//,'').replace(/\/+$/,'');
const digest=value=>createHash('sha256').update(value).digest('hex');
const partsOf=relative=>normalize(relative).split('/').filter(Boolean);

export function sourceExclusionReason(relative){
 const value=normalize(relative),parts=partsOf(value),base=parts.at(-1)||'';
 if(rootStatePrefixes.some(prefix=>value===prefix.slice(0,-1)||value.startsWith(prefix)))return 'workflow-state';
 if(osMetadata.has(base))return 'os-metadata';
 if(/\.(?:pyc|pyo)$/i.test(base)||base==='.coverage')return 'cache';
 if(base.endsWith('.egg-info'))return 'dependency';
 for(const part of parts){
  if(dependencyDirectories.has(part))return 'dependency';
  if(generatedDirectories.has(part))return 'generated';
  if(runtimeDirectories.has(part))return 'workflow-state';
 }
 return null;
}

export function isExcludedSourcePath(relative){return Boolean(sourceExclusionReason(relative));}

function readTracked(root){
 const result=spawnSync('git',['-c','core.fsmonitor=false','ls-files','-z'],{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:32*1024*1024});
 if(result.status!==0||result.error)return null;
 return new Set(result.stdout.split('\0').filter(Boolean));
}

function trackedDirectories(tracked){
 const result=new Set();
 if(!tracked)return result;
 for(const file of tracked){
  const parts=file.split('/');let current='';
  for(let index=0;index<parts.length-1;index++){current=current?`${current}/${parts[index]}`:parts[index];result.add(current);}
 }
 return result;
}

function gitHead(root){
 const result=spawnSync('git',['-c','core.fsmonitor=false','rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
 return result.status===0&&!result.error?result.stdout.trim():null;
}

async function readRegularFile(file){
 const handle=await fs.open(file,fsConstants.O_RDONLY|fsConstants.O_NOFOLLOW);
 try{
  const stat=await handle.stat();
  if(!stat.isFile())throw Error(`Unsupported source entry: ${file}`);
  return {stat,content:await handle.readFile()};
 }finally{await handle.close();}
}

export async function sourceSnapshot(root,{includeManifest=true}={}){
 const tracked=readTracked(root);
 const trackedDirs=trackedDirectories(tracked);
 const entries=[];let bytes=0;
 async function walk(relative='',trackedOnly=false){
  const full=relative?path.join(root,relative):root;
  const children=await fs.readdir(full,{withFileTypes:true});
  children.sort((left,right)=>left.name.localeCompare(right.name));
  for(const item of children){
   const current=relative?`${relative}/${item.name}`:item.name;
   const reason=sourceExclusionReason(current);
   if(item.isDirectory()&&!item.isSymbolicLink()){
    if(reason){
     if((reason==='generated'||reason==='dependency')&&trackedDirs.has(current))await walk(current,true);
     continue;
    }
    if(trackedOnly&&!trackedDirs.has(current))continue;
    await walk(current,trackedOnly);
    continue;
   }
   if(reason&&!((reason==='generated'||reason==='dependency')&&trackedOnly&&tracked?.has(current)))continue;
   if(trackedOnly&&!tracked?.has(current))continue;
   if(entries.length>=MAX_FILES)throw Error(`Source snapshot limit exceeded (${MAX_FILES.toLocaleString('en-US')} files)`);
   const file=path.join(root,current),stat=await fs.lstat(file);
   if(stat.isSymbolicLink()){
    const target=await fs.readlink(file);
    entries.push([current,'symlink',stat.mode&0o777,digest(target)]);
    continue;
   }
   if(stat.isDirectory()){
    await walk(current,trackedOnly);
    continue;
   }
   if(!stat.isFile())throw Error(`Unsupported source entry: ${current}`);
   const regular=await readRegularFile(file);
   bytes+=regular.stat.size;
   if(bytes>MAX_BYTES)throw Error(`Source snapshot limit exceeded (${Math.round(MAX_BYTES/1024/1024)} MiB)`);
   entries.push([current,'file',regular.stat.mode&0o777,digest(regular.content)]);
  }
 }
 await walk();
 const treeHash=digest(JSON.stringify(entries));
 const manifest=entries.map(([filePath,type,mode,fileHash])=>({path:filePath,type,mode,digest:fileHash}));
 return {schemaVersion:SOURCE_SNAPSHOT_SCHEMA_VERSION,treeHash,fingerprint:treeHash,head:gitHead(root),files:entries.length,bytes,...(includeManifest?{manifest}:{})};
}

export function snapshotIdentity(snapshot){return snapshot?.treeHash||snapshot?.fingerprint||null;}

function manifestMap(snapshot){
 if(!snapshot||!Array.isArray(snapshot.manifest))return null;
 return new Map(snapshot.manifest.map(item=>Array.isArray(item)?[item[0],{type:item[1],digest:item[3]}]:[item.path,{type:item.type,digest:item.digest}]));
}

export function diffSourceSnapshots(previous,current){
 const before=manifestMap(previous),after=manifestMap(current);
 if(!before||!after)return {available:false,changes:[],summary:{}};
 const paths=[...new Set([...before.keys(),...after.keys()])].sort(),changes=[];
 for(const filePath of paths){
  const old=before.get(filePath),next=after.get(filePath);
  if(old?.digest===next?.digest&&old?.type===next?.type)continue;
  const change=!old?'added':!next?'removed':'modified';
  changes.push({path:filePath,change,kind:sourceExclusionReason(filePath)||(next?.type==='file'||old?.type==='file'?'source':next?.type||old?.type||'source')});
 }
 const summary=changes.reduce((result,item)=>{result[item.kind]=(result[item.kind]||0)+1;return result;},{});
 return {available:true,changes,summary};
}

export function describeSnapshotDrift(previous,current,{limit=12}={}){
 const before=snapshotIdentity(previous)||'unknown',after=snapshotIdentity(current)||'unknown';
 const diff=diffSourceSnapshots(previous,current);
 if(!diff.available)return `Previous tree: ${before}; current tree: ${after}. A legacy snapshot has no manifest, so the exact changed paths cannot be reported.`;
 if(!diff.changes.length)return `Previous tree: ${before}; current tree: ${after}. Manifest entries match, but snapshot metadata changed.`;
 const shown=diff.changes.slice(0,limit).map(item=>`${item.change}:${item.path} [${item.kind}]`).join(', ');
 const remaining=diff.changes.length>limit?`; +${diff.changes.length-limit} more`:'';
 return `Previous tree: ${before}; current tree: ${after}. Changed ${diff.changes.length} path(s): ${shown}${remaining}.`;
}

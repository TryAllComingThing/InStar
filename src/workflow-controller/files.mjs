import { promises as fs } from 'node:fs';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {safe,identifier} from '../openspec-min/src/store/index.js';
import {acquireFileLock,releaseFileLock} from '../shared/file-lock.mjs';
import {openVerified,readBufferVerified,readTextVerified,renameVerified,unlinkVerified} from '../shared/path-safety.mjs';
export {fs,path,safe,identifier};
export const pluginRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const now=()=>new Date().toISOString();
export function requireText(v,label){if(typeof v!=='string'||!v.trim())throw Error(`${label} must be a nonempty string`);return v;}
export function hash(v){const order=x=>Array.isArray(x)?x.map(order):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,order(x[k])])):x;return createHash('sha256').update(JSON.stringify(order(v))).digest('hex');}
export async function exists(p){try{await fs.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function read(root,...parts){return readTextVerified(root,parts.join('/'));}
export async function json(root,...parts){return JSON.parse(await read(root,...parts));}
async function ensureSafeParent(root,relative){const parts=relative.split('/').slice(0,-1);let current=root;for(const part of parts){current=safe(current,part);try{const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error(`Unsafe output path: ${relative}`);}catch(error){if(error.code!=='ENOENT')throw error;await fs.mkdir(current);}}}
export async function atomic(root,relative,text){
 await ensureSafeParent(root,relative);const tempRelative=`${relative}.${randomUUID()}.tmp`;let stat;
 try{const handle=await openVerified(root,tempRelative,fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_EXCL,0o600);try{await handle.writeFile(text,'utf8');stat=await handle.stat();}finally{await handle.close();}await renameVerified(root,tempRelative,relative,stat);stat=null;}
 finally{if(stat)await unlinkVerified(root,tempRelative,stat).catch(()=>{});}
}
export async function appendJsonl(root,relative,value){
 await ensureSafeParent(root,relative);
 let handle;
 try{handle=await openVerified(root,relative,fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_APPEND,0o600);await handle.writeFile(JSON.stringify(value)+'\n','utf8');}
 finally{if(handle)await handle.close();}
}
export async function putJson(root,relative,data){await atomic(root,relative,JSON.stringify(data,null,2)+'\n');}
export async function projectRoot(input,{initialized=true}={}){
 if(!path.isAbsolute(requireText(input,'project')))throw Error('project must be an explicit absolute path');
 const root=await fs.realpath(input);if(!(await fs.stat(root)).isDirectory())throw Error('project is not a directory');
 const plugin=await fs.realpath(pluginRoot);
 if(root===plugin||root.startsWith(plugin+path.sep))throw Error('Project must not be inside the plugin installation');
 if(initialized){const config=await json(root,'.instar.json');if(config.schemaVersion!==1)throw Error('Unsupported project configuration version');}
 return root;
}
async function assertTree(root,relative){const dir=safe(root,relative);if(!await exists(dir))return;const stat=await fs.lstat(dir);if(!stat.isDirectory())throw Error(`Expected directory: ${relative}`);for(const item of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(relative,item.name);safe(root,name);if(item.isSymbolicLink())throw Error(`Symlink not supported: ${name}`);if(item.isDirectory())await assertTree(root,name);else if(!item.isFile())throw Error(`Unsupported entry: ${name}`);}}
const snapshotExcluded=new Set(['.git','node_modules','dist','build','coverage','reports','logs','.workflow','planning','.next','.nuxt','vendor']);
const snapshotMetadata=new Set(['.DS_Store','Thumbs.db','desktop.ini']);
const snapshotGovernance=['.instar.json','.instar-quality.json','AGENTS.md','.context/AGENTS.md','DESIGN.md','ARCHITECTURE.md'];
const snapshotSensitive=name=>/(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/.test(name);
function snapshotExcludedPath(relative){
 const parts=relative.split('/');
 if(parts.some(part=>snapshotExcluded.has(part)))return true;
 if(relative==='docs/prd'||relative.startsWith('docs/prd/')||relative==='.instar/session'||relative.startsWith('.instar/session/'))return true;
 return snapshotMetadata.has(parts.at(-1));
}
async function gitSnapshotPaths(root){
 const git=spawnSync('git',['-c','core.fsmonitor=false','ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:64*1024*1024});
 if(git.status!==0||git.error)return null;
 return git.stdout.split('\0').filter(Boolean);
}
async function snapshotPath(root,relative){
 try{return safe(root,relative);}
 catch(error){if(/Symlinks are unsupported/.test(error.message))throw Error(`Symlink not supported in source snapshot: ${relative}`);throw error;}
}
export async function sourceSnapshot(root){
 const entries=[],seen=new Set();let bytes=0;
 const configured=await (async()=>{
  try{const config=JSON.parse(await read(root,'.instar-quality.json'));const inputs=config?.verification?.inputs;if(inputs===undefined)return [];if(!Array.isArray(inputs)||inputs.some(value=>typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..')))throw Error('Invalid verification.inputs in .instar-quality.json');return inputs;}catch(error){if(error.code==='ENOENT')return [];throw error;}
 })();
 async function add(relative,{force=false,depth=0}={}){
  if(relative===''||seen.has(relative))return;
  if(snapshotSensitive(relative))throw Error(`Sensitive path is not allowed in source snapshot: ${relative}`);
  if(!force&&snapshotExcludedPath(relative))return;
  if(depth>64)throw Error('Configured verification inputs exceed maximum directory depth of 64');
  if(entries.length>=50000)throw Error('Source snapshot limit exceeded (50,000 files)');
  const file=await snapshotPath(root,relative);
  let stat;try{stat=await fs.lstat(file);}catch(error){if(error.code==='ENOENT')return;throw error;}
  if(stat.isSymbolicLink())throw Error(`Symlink not supported in source snapshot: ${relative}`);
  if(stat.isDirectory()){
   if(!force&&snapshotExcludedPath(relative))return;
   const items=(await fs.readdir(file,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
   if(items.length>10000)throw Error('Configured verification input directory is too large');
   for(const item of items){
    if(['.git','node_modules','reports','logs','dist','build','coverage'].includes(item.name))continue;
    await add(relative?`${relative}/${item.name}`:item.name,{force,depth:depth+1});
   }
   return;
  }
  if(!stat.isFile())throw Error(`Unsupported source entry: ${relative}`);
  if(!force&&snapshotExcludedPath(relative))return;
  seen.add(relative);
  bytes+=stat.size;if(bytes>536870912)throw Error('Source snapshot limit exceeded (512 MiB)');
  const content=await readBufferVerified(root,relative);entries.push([relative,stat.mode&0o777,createHash('sha256').update(content).digest('hex')]);
 }
 const candidates=await gitSnapshotPaths(root);
 if(candidates){
  for(const relative of [...new Set([...candidates,...snapshotGovernance])].sort())await add(relative);
 }else{
  async function walk(dir=''){
   const full=dir?await snapshotPath(root,dir):root;
   for(const item of (await fs.readdir(full,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const relative=dir?`${dir}/${item.name}`:item.name;
    if(item.isDirectory()){if(!snapshotExcludedPath(relative))await walk(relative);}
    else await add(relative);
   }
  }
  await walk();
 }
 // verification.inputs may name ignored files that Git never reports. They are
 // still quality inputs, so a change there must invalidate workflow evidence.
 for(const input of configured)await add(input,{force:true});
 let head=null;
 const git=spawnSync('git',['-c','core.fsmonitor=false','rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
 if(git.status===0&&!git.error)head=git.stdout.trim();
 const treeHash=createHash('sha256').update(JSON.stringify(entries)).digest('hex');
 return {treeHash,head,files:entries.length,bytes};
}
export async function lock(root,action,actionName='workflow'){
 const dir=safe(root,'.workflow');
 try{await fs.mkdir(dir);}catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=await fs.lstat(dir);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Unsafe .workflow directory');
 const file=safe(root,'.workflow/controller.lock');
 const handle=await acquireFileLock(file,{relative:'.workflow/controller.lock',action:actionName,label:'Workflow'});
 try{return await action();}
 finally{await releaseFileLock(handle);}
}
const legacyTrace='.workflow/traces.jsonl';
const tracePath=id=>`.workflow/traces/${identifier(id)}.jsonl`;
function parseTrace(text){return text.split('\n').filter(Boolean).map(line=>JSON.parse(line));}
export async function changeTraces(root,id){
 const shard=tracePath(id);
 if(await exists(safe(root,shard)))return parseTrace(await read(root,shard)).filter(item=>item.changeId===id);
 try{return parseTrace(await read(root,legacyTrace)).filter(item=>item.changeId===id);}
 catch(error){if(error.code==='ENOENT')return [];throw error;}
}
export async function appendTrace(root,id,record){
 const shard=tracePath(id);
 if(!await exists(safe(root,shard))){
  try{
   for(const item of parseTrace(await read(root,legacyTrace)).filter(item=>item.changeId===id))await appendJsonl(root,shard,item);
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }
 await appendJsonl(root,shard,record);
 await appendJsonl(root,legacyTrace,record);
}
export async function gcTransactions(root,{retain=50}={}){
 if(!Number.isInteger(retain)||retain<1||retain>1000)throw Error('retain must be an integer between 1 and 1000');
 const dir=safe(root,'.workflow/transactions');
 if(!await exists(dir))return {removed:[],retained:0};
 if(await exists(safe(root,'.workflow/pending.json')))throw Error('Cannot collect transaction backups while a recovery journal is pending');
 const entries=[];
 for(const item of await fs.readdir(dir,{withFileTypes:true})){
  if(!item.isDirectory())continue;
  const full=path.join(dir,item.name);let status='unknown',at='';
  try{const record=JSON.parse(await fs.readFile(path.join(full,'result.json'),'utf8'));status=record.status;at=record.at||'';}
  catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  entries.push({name:item.name,full,status,at});
 }
 const removable=entries.filter(item=>['committed','rolled-back'].includes(item.status)).sort((a,b)=>String(b.at).localeCompare(String(a.at))||b.name.localeCompare(a.name));
 const remove=removable.slice(retain);
 for(const item of remove)await fs.rm(item.full,{recursive:true,force:true});
 return {removed:remove.map(item=>item.name),retained:entries.length-remove.length};
}
const trees=['planning','docs/prd'];
export async function transaction(root,action){
 const journal='.workflow/pending.json';if(await exists(safe(root,journal)))throw Error('Interrupted transaction exists; inspect it and use recover before continuing');
 const id=randomUUID();const backup=`.workflow/transactions/${id}`;const present={};
 for(const tree of trees){await assertTree(root,tree);present[tree]=await exists(safe(root,tree));if(present[tree])await fs.cp(safe(root,tree),safe(root,backup,'before',tree),{recursive:true});}
 const record={id,at:now(),present,backup};await putJson(root,journal,record);
 let result;
 try{result=await action();await putJson(root,`${backup}/result.json`,{...record,status:'committed',at:now()});}
 catch(error){try{await restore(root,record);await putJson(root,`${backup}/result.json`,{...record,status:'rolled-back',error:error.message});await fs.unlink(safe(root,journal));}catch(rollback){throw new AggregateError([error,rollback],'Rollback failed; pending journal preserved for recovery');}throw error;}
 // A committed result is authoritative. Journal cleanup must never enter the
 // rollback branch: a crash or EACCES after the commit marker previously made
 // recovery undo work the caller had been told succeeded.
 try{await fs.unlink(safe(root,journal));}catch(error){process.stderr.write(`InStar transaction committed but journal cleanup failed: ${error.message}; run recover\n`);}
 try{await gcTransactions(root);}catch(error){process.stderr.write(`InStar transaction GC warning: ${error.message}\n`);}
 return result;
}
function assertRecoveryRecord(record){
 if(!record||!record.backup||!/^[a-f0-9-]{36}$/.test(record.id)||record.backup!==`.workflow/transactions/${record.id}`)throw Error('Invalid recovery journal');
 for(const tree of trees)if(typeof record.present?.[tree]!=='boolean')throw Error('Invalid recovery snapshot');
}
export async function restore(root,record){
 assertRecoveryRecord(record);
 for(const tree of trees){await assertTree(root,tree);if(record.present[tree]){await assertTree(root,`${record.backup}/before/${tree}`);if(!await exists(safe(root,record.backup,'before',tree)))throw Error('Recovery snapshot missing');}}
 for(const tree of trees){await fs.rm(safe(root,tree),{recursive:true,force:true});if(record.present[tree])await fs.cp(safe(root,record.backup,'before',tree),safe(root,tree),{recursive:true});}
}
export async function recoverPending(root,record,reason){
 assertRecoveryRecord(record);
 let status=null;
 try{const result=JSON.parse(await read(root,record.backup,'result.json'));status=result?.status??null;}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
 if(status==='committed'||status==='rolled-back'){
  await fs.unlink(safe(root,'.workflow/pending.json'));
  return {recovered:record.id,[status==='committed'?'committed':'alreadyRolledBack']:true};
 }
 await restore(root,record);
 await putJson(root,`${record.backup}/result.json`,{...record,status:'recovered',reason});
 await fs.unlink(safe(root,'.workflow/pending.json'));
 return {recovered:record.id};
}

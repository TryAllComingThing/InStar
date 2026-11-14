import { promises as fs } from 'node:fs';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
import {fileURLToPath} from 'node:url';
import {safe,identifier} from '../openspec-min/src/store/index.js';
import {acquireFileLock,releaseFileLock} from '../shared/file-lock.mjs';
import {openVerified,readBufferVerified,readTextVerified,readDirectoryVerified,renameVerified,unlinkVerified,ensureDirectoryVerified,copyTreeVerified,removeTreeVerified,removeFileVerified,lstatVerified,pathExistsVerified} from '../shared/path-safety.mjs';
import {readBoundedVerified,MAX_JSON_INPUT_BYTES} from '../shared/bounded-input.mjs';
import {scanSourceInventory} from '../shared/source-inventory.mjs';
export {fs,path,safe,identifier};
export const pluginRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const now=()=>new Date().toISOString();
export function requireText(v,label){if(typeof v!=='string'||!v.trim())throw Error(`${label} must be a nonempty string`);return v;}
export function hash(v){const order=x=>Array.isArray(x)?x.map(order):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,order(x[k])])):x;return createHash('sha256').update(JSON.stringify(order(v))).digest('hex');}
export async function exists(p){try{await fs.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
const requestScope=new AsyncLocalStorage();
export function withSnapshotSession(action){
 return requestScope.run({snapshots:new Map(),observations:new Map()},action);
}
function currentScope(){return requestScope.getStore()||null;}
export async function read(root,...parts){return readTextVerified(root,parts.join('/'));}
export async function json(root,...parts){return JSON.parse(await readBoundedVerified(root,parts.join('/'),MAX_JSON_INPUT_BYTES));}
async function ensureSafeParent(root,relative){const parent=path.posix.dirname(relative);if(parent!=='.')await ensureDirectoryVerified(root,parent,{mode:0o700});}
export async function atomic(root,relative,text){
 await ensureSafeParent(root,relative);const tempRelative=`${relative}.${randomUUID()}.tmp`;let stat;
 try{const handle=await openVerified(root,tempRelative,fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_EXCL,0o600);try{await handle.writeFile(text,'utf8');stat=await handle.stat();}finally{await handle.close();}await renameVerified(root,tempRelative,relative,stat);stat=null;}
 finally{if(stat)await unlinkVerified(root,tempRelative,stat).catch(()=>{});}
}
export async function appendJsonl(root,relative,value){
 await ensureSafeParent(root,relative);
 let handle;
 try{
  handle=await openVerified(root,relative,fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_APPEND,0o600);
  const record=Buffer.from(JSON.stringify(value)+'\n','utf8');
  const current=await handle.stat();
  const maxBytes=64*1024*1024;
  if(current.size+record.length>maxBytes)throw Error(`${relative} exceeds ${maxBytes} byte limit`);
  const {bytesWritten}=await handle.write(record);
  if(bytesWritten!==record.length)throw Error(`Short JSONL append for ${relative}`);
 } finally{if(handle)await handle.close();}
}
export async function putJson(root,relative,data){await atomic(root,relative,JSON.stringify(data,null,2)+'\n');}
export async function projectRoot(input,{initialized=true}={}){
 if(!path.isAbsolute(requireText(input,'project')))throw Error('project must be an explicit absolute path');
 const root=await fs.realpath(input);const rootStat=await fs.lstat(root);if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw Error('project is not a directory');
 const plugin=await fs.realpath(pluginRoot);
 if(root===plugin||root.startsWith(plugin+path.sep))throw Error('Project must not be inside the plugin installation');
 if(initialized){const config=await json(root,'.instar.json');if(config.schemaVersion!==1)throw Error('Unsupported project configuration version');}
 return root;
}
function sameDirectoryIdentity(left,right){return Boolean(left&&right&&left.dev===right.dev&&left.ino===right.ino);}
async function assertTree(root,relative){let entries;try{entries=await readDirectoryVerified(root,relative,{maxEntries:10000,label:`transaction tree ${relative}`});}catch(error){if(error.code==='ENOENT')return;throw error;}for(const item of entries){const name=relative==='.'?item.name:`${relative}/${item.name}`;if(item.isSymbolicLink())throw Error(`Symlink not supported: ${name}`);if(item.isDirectory())await assertTree(root,name);else if(!item.isFile())throw Error(`Unsupported entry: ${name}`);}}
async function configuredVerificationInputs(root){
 try{
  const config=JSON.parse(await read(root,'.instar-quality.json'));
  const inputs=config?.verification?.inputs;
  if(inputs===undefined)return [];
  if(!Array.isArray(inputs)||inputs.some(value=>typeof value!=='string'||!value.trim()||path.isAbsolute(value)||value.split(/[\\/]/).includes('..')))throw Error('Invalid verification.inputs in .instar-quality.json');
  return inputs;
 }catch(error){if(error.code==='ENOENT')return [];throw error;}
}
async function currentInventory(root){return scanSourceInventory(root,{include:await configuredVerificationInputs(root),label:'source snapshot'});}
const baselinePath=id=>`.instar/baselines/${identifier(id)}.json`;
const baselinePayload=baseline=>{const {baselineHash,...payload}=baseline;return payload;};
function validBaseline(value,id){
 if(!value||![1,2,3].includes(value.schemaVersion)||value.changeId!==id||typeof value.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(value.fingerprint)||!Array.isArray(value.entries))return false;
 return value.entries.every(entry=>{if(!entry)return false;const modeOk=value.schemaVersion<3||(Number.isInteger(entry.mode)&&entry.mode>=0&&entry.mode<=0o777);return typeof entry.path==='string'&&/^[a-f0-9]{64}$/.test(entry.hash)&&Number.isInteger(entry.lines)&&modeOk;});
}
export function baselineReference(baseline,changeId=baseline.changeId){
 return {path:baselinePath(identifier(changeId)),schemaVersion:baseline.schemaVersion,fingerprint:baseline.fingerprint,baselineHash:baseline.baselineHash,createdAt:baseline.createdAt,ignorePolicyHash:baseline.ignorePolicy?.hash??null,ignorePolicyRisk:baseline.ignorePolicy?.risk??null};
}
export async function captureChangeBaseline(root,changeId){
 const id=identifier(changeId),inventory=await currentInventory(root);
 const payload={schemaVersion:3,changeId:id,createdAt:now(),fingerprint:inventory.fingerprint,entries:inventory.entries.map(({path,hash,bytes,mode,lines,binary})=>({path,hash,bytes,mode,lines,binary})),ignorePolicy:inventory.ignorePolicy,trust:{mode:'local-evidence',cryptographic:false,scope:'current-workspace'}};
 const baseline={...payload,baselineHash:hash(payload)};
 await putJson(root,baselinePath(id),baseline);
 return baseline;
}
export async function readChangeBaseline(root,changeId,{expected=null}={}){
 const id=identifier(changeId),baseline=await json(root,baselinePath(id));
 if(!validBaseline(baseline,id))throw Error(`Invalid change baseline: ${baselinePath(id)}`);
 const actualHash=baseline.schemaVersion>=2?hash(baselinePayload(baseline)):hash(baseline);
 if(baseline.schemaVersion>=2&&baseline.baselineHash!==actualHash)throw Error(`Change baseline content hash mismatch: ${baselinePath(id)}`);
 if(expected){
  if(expected.fingerprint!==baseline.fingerprint||expected.baselineHash!==actualHash)throw Error('Change baseline does not match the owning change state; the baseline may be stale or replaced');
  if(expected.path&&expected.path!==baselinePath(id))throw Error('Change baseline path does not match the owning change state');
 }
 return baseline;
}
export async function sourceSnapshot(root,{fresh=false}={}){
 const scope=currentScope();
 if(!fresh&&scope?.snapshots.has(root))return scope.snapshots.get(root);
 const inventory=await currentInventory(root);
 const result={treeHash:inventory.fingerprint,fingerprint:inventory.fingerprint,files:inventory.files,bytes:inventory.bytes,ignorePolicy:inventory.ignorePolicy,mode:'workspace-scan',trust:inventory.trust};
 if(scope&&!fresh)scope.snapshots.set(root,result);
 return result;
}
export async function observeChangedSourcePaths(root,{changeId,baseline:expectedBaseline=null,fresh=false}={}){
 if(!changeId)return {mode:'unavailable',paths:[],changedLines:null,reason:'A change baseline is required to observe source changes'};
 const scope=currentScope(),key=`${root}\0${identifier(changeId)}`;
 if(!fresh&&scope?.observations.has(key))return scope.observations.get(key);
 let baseline;
 try{baseline=await readChangeBaseline(root,changeId,{expected:expectedBaseline});}
 catch(error){if(error.code==='ENOENT')return {mode:'unavailable',paths:[],changedLines:null,reason:'Change baseline is missing'};throw error;}
 const current=await currentInventory(root),before=new Map(baseline.entries.map(entry=>[entry.path,entry])),after=new Map(current.entries.map(entry=>[entry.path,entry]));
 const paths=[],changes=[];let changedLines=0;
 for(const name of [...new Set([...before.keys(),...after.keys()])].sort()){
  const old=before.get(name),next=after.get(name);
  if(old?.hash===next?.hash&&(old?.mode===undefined||old.mode===next?.mode))continue;
  paths.push(name);
  const delta=(old?.lines??0)+(next?.lines??0);
  changedLines+=delta;
  changes.push({path:name,status:!old?'added':!next?'deleted':'modified',baselineLines:old?.lines??0,currentLines:next?.lines??0,...(old?.mode!==undefined?{baselineMode:old.mode,currentMode:next?.mode??null}:{})});
 }
 const result={mode:'baseline',baselineFingerprint:baseline.fingerprint,currentFingerprint:current.fingerprint,ignorePolicy:current.ignorePolicy,paths,changes,changedFiles:paths.length,changedLines};
 if(scope&&!fresh)scope.observations.set(key,result);
 return result;
}
export async function changedSourcePaths(root,options={}){
 const observed=await observeChangedSourcePaths(root,options);
 if(observed.mode==='unavailable')throw Error(observed.reason||'Unable to derive changed paths for risk classification');
 return observed.paths;
}
export async function lock(root,action,actionName='workflow'){
 await ensureDirectoryVerified(root,'.workflow',{mode:0o700});
 const file=safe(root,'.workflow/controller.lock');
 const handle=await acquireFileLock(file,{root,relative:'.workflow/controller.lock',action:actionName,label:'Workflow'});
 try{return await action();}
 finally{await releaseFileLock(handle);}
}
const legacyTrace='.workflow/traces.jsonl';
const tracePath=id=>`.workflow/traces/${identifier(id)}.jsonl`;
function parseTrace(text){return text.split('\n').filter(Boolean).map(line=>JSON.parse(line));}
export async function changeTraces(root,id){
 const shard=tracePath(id);
 if(await pathExistsVerified(root,shard))return parseTrace(await read(root,shard)).filter(item=>item.changeId===id);
 try{return parseTrace(await read(root,legacyTrace)).filter(item=>item.changeId===id);}
 catch(error){if(error.code==='ENOENT')return [];throw error;}
}
export async function appendTrace(root,id,record){
 const shard=tracePath(id);
 if(!await pathExistsVerified(root,shard)){
  try{
   for(const item of parseTrace(await read(root,legacyTrace)).filter(item=>item.changeId===id))await appendJsonl(root,shard,item);
  }catch(error){if(error.code!=='ENOENT')throw error;}
 }
 await appendJsonl(root,shard,record);
}
export async function gcTransactions(root,{retain=50}={}){
 if(!Number.isInteger(retain)||retain<1||retain>1000)throw Error('retain must be an integer between 1 and 1000');
 let rootStat;
 try{rootStat=await readDirectoryVerified(root,'.workflow/transactions',{maxEntries:10000,label:'transaction backups'});}catch(error){if(error.code==='ENOENT')return {removed:[],retained:0};throw error;}
 if(await pathExistsVerified(root,'.workflow/pending.json'))throw Error('Cannot collect transaction backups while a recovery journal is pending');
 const dir=safe(root,'.workflow/transactions');
 await lstatVerified(root,'.workflow/transactions');
 const items=rootStat;
 const entries=[];
 for(const item of items){
  if(!item.isDirectory()||!/^[a-f0-9-]{36}$/.test(item.name))continue;
  const full=path.join(dir,item.name),relative=`.workflow/transactions/${item.name}`;
  const initial=await lstatVerified(root,relative);
  if(!initial.isDirectory())throw Error(`Unsafe transaction backup: ${relative}`);
  let status='unknown',at='';
  try{const record=JSON.parse(await readBoundedVerified(root,`${relative}/result.json`,MAX_JSON_INPUT_BYTES));status=record.status;at=record.at||'';}
  catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  entries.push({name:item.name,full,relative,status,at,dev:initial.dev,ino:initial.ino});
 }
 const removable=entries.filter(item=>['committed','rolled-back'].includes(item.status)).sort((a,b)=>String(b.at).localeCompare(String(a.at))||b.name.localeCompare(a.name));
 const remove=removable.slice(retain);
 for(const item of remove){
  const current=await lstatVerified(root,item.relative);
  if(!current.isDirectory()||!sameDirectoryIdentity(current,item))throw Error(`Unsafe transaction backup: ${item.relative}`);
  await removeTreeVerified(root,item.relative,{expected:current,label:'transaction backup cleanup'});
 }
 return {removed:remove.map(item=>item.name),retained:entries.length-remove.length};
}
const trees=['planning','docs/prd'];
export async function transaction(root,action){
 const journal='.workflow/pending.json';if(await pathExistsVerified(root,journal))throw Error('Interrupted transaction exists; inspect it and use recover before continuing');
 const id=randomUUID();const backup=`.workflow/transactions/${id}`;const present={};
 for(const tree of trees){await assertTree(root,tree);present[tree]=await pathExistsVerified(root,tree);if(present[tree])await copyTreeVerified(root,tree,`${backup}/before/${tree}`,{label:`transaction backup ${tree}`});}
 const record={id,at:now(),present,backup};await putJson(root,journal,record);
 let result;
 try{result=await action();await putJson(root,`${backup}/result.json`,{...record,status:'committed',at:now()});}
 catch(error){try{await restore(root,record);await putJson(root,`${backup}/result.json`,{...record,status:'rolled-back',error:error.message});await removeFileVerified(root,journal);}catch(rollback){throw new AggregateError([error,rollback],'Rollback failed; pending journal preserved for recovery');}throw error;}
 // A committed result is authoritative. Journal cleanup must never enter the
 // rollback branch: a crash or EACCES after the commit marker previously made
 // recovery undo work the caller had been told succeeded.
 try{await removeFileVerified(root,journal);}catch(error){process.stderr.write(`InStar transaction committed but journal cleanup failed: ${error.message}; run recover\n`);}
 try{await gcTransactions(root);}catch(error){process.stderr.write(`InStar transaction GC warning: ${error.message}\n`);}
 return result;
}
function assertRecoveryRecord(record){
 if(!record||!record.backup||!/^[a-f0-9-]{36}$/.test(record.id)||record.backup!==`.workflow/transactions/${record.id}`)throw Error('Invalid recovery journal');
 for(const tree of trees)if(typeof record.present?.[tree]!=='boolean')throw Error('Invalid recovery snapshot');
}
export async function restore(root,record){
 assertRecoveryRecord(record);
 for(const tree of trees){await assertTree(root,tree);if(record.present[tree]){await assertTree(root,`${record.backup}/before/${tree}`);if(!await pathExistsVerified(root,`${record.backup}/before/${tree}`))throw Error('Recovery snapshot missing');}}
 for(const tree of trees){await removeTreeVerified(root,tree,{label:`transaction restore ${tree}`});if(record.present[tree])await copyTreeVerified(root,`${record.backup}/before/${tree}`,tree,{label:`transaction restore ${tree}`});}
}
export async function recoverPending(root,record,reason){
 assertRecoveryRecord(record);
 let status=null;
 try{const result=await json(root,record.backup,'result.json');status=result?.status??null;}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
 if(status==='committed'||status==='rolled-back'){
  await removeFileVerified(root,'.workflow/pending.json');
  return {recovered:record.id,[status==='committed'?'committed':'alreadyRolledBack']:true};
 }
 await restore(root,record);
 await putJson(root,`${record.backup}/result.json`,{...record,status:'recovered',reason});
 await removeFileVerified(root,'.workflow/pending.json');
 return {recovered:record.id};
}

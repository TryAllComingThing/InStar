import { promises as fs } from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {AsyncLocalStorage} from 'node:async_hooks';
import {safe,identifier} from '../openspec-min/src/store/index.js';
export {fs,path,safe,identifier};
const transactionContext=new AsyncLocalStorage();
function assertDeclaredWrite(root,relative){const context=transactionContext.getStore();if(context&&context.root===root&&!relative.startsWith('.workflow/')&&!context.writePaths.some(p=>relative===p||relative.startsWith(p+'/')))throw Error(`Write outside transaction write set: ${relative}`);}
export const pluginRoot=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
export const now=()=>new Date().toISOString();
export function requireText(v,label){if(typeof v!=='string'||!v.trim())throw Error(`${label} must be a nonempty string`);return v;}
export function hash(v){const order=x=>Array.isArray(x)?x.map(order):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,order(x[k])])):x;return createHash('sha256').update(JSON.stringify(order(v))).digest('hex');}
export async function exists(p){try{await fs.lstat(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
export async function read(root,...parts){return fs.readFile(safe(root,...parts),'utf8');}
export async function json(root,...parts){return JSON.parse(await read(root,...parts));}
async function ensureSafeParent(root,relative){const parts=relative.split('/').slice(0,-1);let current=root;for(const part of parts){current=safe(current,part);try{const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error(`Unsafe output path: ${relative}`);}catch(error){if(error.code!=='ENOENT')throw error;await fs.mkdir(current);}}}
export async function atomic(root,relative,text){assertDeclaredWrite(root,relative);const dest=safe(root,relative);await ensureSafeParent(root,relative);const tmp=safe(root,`${relative}.${randomUUID()}.tmp`);try{await fs.writeFile(tmp,text,{flag:'wx'});await fs.rename(tmp,dest);}finally{await fs.rm(tmp,{force:true});}}
export async function appendJsonl(root,relative,value){assertDeclaredWrite(root,relative);const dest=safe(root,relative);await ensureSafeParent(root,relative);try{const stat=await fs.lstat(dest);if(stat.isSymbolicLink()||!stat.isFile())throw Error(`Unsafe output path: ${relative}`);}catch(error){if(error.code!=='ENOENT')throw error;}await fs.appendFile(dest,JSON.stringify(value)+'\n',{encoding:'utf8',flag:'a'});}
export async function putJson(root,relative,data){await atomic(root,relative,JSON.stringify(data,null,2)+'\n');}
export async function projectRoot(input){
 if(!path.isAbsolute(requireText(input,'project')))throw Error('project must be an explicit absolute path');
 const root=await fs.realpath(input);if(!(await fs.stat(root)).isDirectory())throw Error('project is not a directory');
 const plugin=await fs.realpath(pluginRoot);
 if(root===plugin||root.startsWith(plugin+path.sep))throw Error('Project must not be inside the plugin installation');
 return root;
}
export async function assertTree(root,relative){const dir=safe(root,relative);if(!await exists(dir))return;const stat=await fs.lstat(dir);if(!stat.isDirectory())throw Error(`Expected directory: ${relative}`);for(const item of await fs.readdir(dir,{withFileTypes:true})){const name=path.join(relative,item.name);safe(root,name);if(item.isSymbolicLink())throw Error(`Symlink not supported: ${name}`);if(item.isDirectory())await assertTree(root,name);else if(!item.isFile())throw Error(`Unsupported entry: ${name}`);}}
export async function sourceSnapshot(root){
 const excluded=new Set(['.git','node_modules','dist','build','coverage','reports','logs','.workflow','planning','.next','.nuxt','vendor']);
 const entries=[];let bytes=0;
 async function walk(dir=''){
  const full=dir?safe(root,dir):root;
  for(const item of (await fs.readdir(full,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(!dir&&excluded.has(item.name))continue;
   const relative=dir?`${dir}/${item.name}`:item.name;
   if(relative==='docs/prd'||relative.startsWith('docs/prd/')||relative==='.instar/session'||relative.startsWith('.instar/session/'))continue;
   if(entries.length>=50000)throw Error('Source snapshot limit exceeded (50,000 files)');
   const file=safe(root,relative),stat=await fs.lstat(file);
   if(stat.isSymbolicLink()){
    const target=await fs.readlink(file);entries.push([relative,'symlink',createHash('sha256').update(target).digest('hex')]);continue;
   }
   if(stat.isDirectory()){await walk(relative);continue;}
   if(!stat.isFile())throw Error(`Unsupported source entry: ${relative}`);
   bytes+=stat.size;if(bytes>536870912)throw Error('Source snapshot limit exceeded (512 MiB)');
   const content=await fs.readFile(file);entries.push([relative,stat.mode&0o777,createHash('sha256').update(content).digest('hex')]);
  }
 }
 await walk();
 let head=null;
 const git=spawnSync('git',['-c','core.fsmonitor=false','rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
 if(git.status===0&&!git.error)head=git.stdout.trim();
 const treeHash=createHash('sha256').update(JSON.stringify(entries)).digest('hex');
 return {treeHash,head,files:entries.length,bytes};
}
export async function lock(root,action){
 const dir=safe(root,'.workflow');
 try{await fs.mkdir(dir);}catch(error){if(error.code!=='EEXIST')throw error;}
 const stat=await fs.lstat(dir);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Unsafe .workflow directory');
 const file=safe(root,'.workflow/controller.lock');const handle=await fs.open(file,'wx');
 try{await handle.writeFile(JSON.stringify({pid:process.pid,at:now()}));return await action();}
 finally{await handle.close();await fs.unlink(file);}
}
const trees=['planning','docs/prd'];
export async function transaction(root,action,options={}){
 const journal='.workflow/pending.json';if(await exists(safe(root,journal)))throw Error('Interrupted transaction exists; inspect it and use recover before continuing');
 const {normalizeWritePaths,assertTarget,missingParents}=await import('./write-set.mjs');
 const writePaths=normalizeWritePaths(options.writePaths||trees);
 const {backupBudget}=await import('./recovery.mjs');await backupBudget(root,writePaths);
 const id=randomUUID();const backup=`.workflow/transactions/${id}`;const present={};
 const absentParents=await missingParents(root,writePaths);
 await ensureSafeParent(root,`${backup}/before/placeholder`);
 for(const tree of writePaths){await assertTarget(root,tree);present[tree]=await exists(safe(root,tree));if(present[tree]){await ensureSafeParent(root,`${backup}/before/${tree}`);await fs.cp(safe(root,tree),safe(root,backup,'before',tree),{recursive:true});}}
 const record={schemaVersion:2,id,at:now(),writePaths,missingParents:absentParents,present,backup};await putJson(root,journal,record);
 try{const result=await transactionContext.run({root,writePaths},action);await putJson(root,`${backup}/result.json`,{...record,status:'committed',at:now()});await fs.unlink(safe(root,journal));return result;}
 catch(error){try{await restore(root,record);await putJson(root,`${backup}/result.json`,{...record,status:'rolled-back',error:error.message});await fs.unlink(safe(root,journal));}catch(rollback){throw new AggregateError([error,rollback],'Rollback failed; pending journal preserved for recovery');}throw error;}
}
export async function restore(root,record){
 if(!/^[a-f0-9-]{36}$/.test(record.id)||record.backup!==`.workflow/transactions/${record.id}`)throw Error('Invalid recovery journal');
 if(record.schemaVersion!==undefined&&![1,2].includes(record.schemaVersion))throw Error('Unsupported recovery journal version');
 if(record.schemaVersion===2){
  const {normalizeWritePaths,assertTarget}=await import('./write-set.mjs');const paths=normalizeWritePaths(record.writePaths);
  if(JSON.stringify(paths)!==JSON.stringify(record.writePaths)||!Array.isArray(record.missingParents)||record.missingParents.some(p=>typeof p!=='string'||!paths.some(file=>file.startsWith(p+'/'))||p.split('/').some(part=>!part||part==='.'||part==='..')))throw Error('Invalid scoped recovery journal');
  for(const file of paths){if(typeof record.present[file]!=='boolean')throw Error('Invalid recovery snapshot');await assertTarget(root,file);if(record.present[file]){await assertTarget(root,`${record.backup}/before/${file}`);if(!await exists(safe(root,record.backup,'before',file)))throw Error('Recovery snapshot missing');}}
  for(const file of paths){await fs.rm(safe(root,file),{recursive:true,force:true});if(record.present[file]){await ensureSafeParent(root,file);await fs.cp(safe(root,record.backup,'before',file),safe(root,file),{recursive:true});}}
  for(const dir of record.missingParents){await assertTarget(root,dir);try{await fs.rmdir(safe(root,dir));}catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}}
  return;
 }
 for(const tree of trees){if(typeof record.present?.[tree]!=='boolean')throw Error('Invalid recovery snapshot');await assertTree(root,tree);if(record.present[tree]){await assertTree(root,`${record.backup}/before/${tree}`);if(!await exists(safe(root,record.backup,'before',tree)))throw Error('Recovery snapshot missing');}}
 for(const tree of trees){await fs.rm(safe(root,tree),{recursive:true,force:true});if(record.present[tree])await fs.cp(safe(root,record.backup,'before',tree),safe(root,tree),{recursive:true});}
}

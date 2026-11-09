import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function acquireFileLock(file,{relative=file,action='unknown',label='InStar'}={}){
 await fs.mkdir(path.dirname(file),{recursive:true});
 let handle;
 try{handle=await fs.open(file,'wx');}
 catch(error){
  if(error.code!=='EEXIST')throw error;
  let owner=null;
  try{owner=JSON.parse(await fs.readFile(file,'utf8'));}catch{}
  const details=owner&&typeof owner==='object'?`pid=${owner.pid??'unknown'}, at=${owner.at??'unknown'}, action=${owner.action??'unknown'}`:'owner metadata unavailable';
  const conflict=Error(`${label} lock already running (EEXIST): ${details}; inspect ${relative} and run 'ps -p <pid>' before removing a confirmed stale lock`);
  conflict.code='EEXIST';conflict.owner=owner;throw conflict;
 }
 const token=randomUUID();
 try{await handle.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString(),action,token}));return {file,handle,token};}
 catch(error){await handle.close().catch(()=>{});await fs.unlink(file).catch(()=>{});throw error;}
}

export async function releaseFileLock(lock){
 if(!lock)return;
 await lock.handle.close();
 let owner=null;
 try{owner=JSON.parse(await fs.readFile(lock.file,'utf8'));}
 catch(error){if(error.code==='ENOENT')return;throw error;}
 if(owner?.token!==lock.token)return;
 try{await fs.unlink(lock.file);}
 catch(error){if(error.code!=='ENOENT')throw error;}
}

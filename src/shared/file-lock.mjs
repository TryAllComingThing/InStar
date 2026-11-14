import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {readBoundedVerified} from './bounded-input.mjs';
import {
 assertDirectoryIdentityVerified,
 createDirectoryVerified,
 ensureDirectoryVerified,
 openVerified,
 readHandleVerified,
 removeDirectoryVerified,
 unlinkVerified
} from './path-safety.mjs';

function sameIdentity(left,right){return Boolean(left&&right&&left.dev===right.dev&&left.ino===right.ino);}
function relative(root,file,label){
 const value=path.relative(root,file);
 if(!value||value==='..'||value.startsWith(`..${path.sep}`)||path.isAbsolute(value))throw Error(`${label} must be inside the workspace`);
 return value.split(path.sep).join('/');
}
async function readOwner(root,ownerRelative){
 try{return JSON.parse(await readBoundedVerified(root,ownerRelative,64*1024));}
 catch(error){if(error.code==='ENOENT'||error.code==='EPATHCHANGED')return null;throw error;}
}

export async function acquireFileLock(file,{root=path.dirname(file),relative:displayRelative=file,action='unknown',label='InStar'}={}){
 const projectRoot=path.resolve(root);
 const lockRelative=relative(projectRoot,file,`${label} lock`);
 const ownerRelative=`${lockRelative}/owner.json`;
 const parentRelative=path.posix.dirname(lockRelative);
 if(parentRelative!=='.')await ensureDirectoryVerified(projectRoot,parentRelative,{mode:0o700});

 let created=false,directoryStat=null;
 try{
  directoryStat=await createDirectoryVerified(projectRoot,lockRelative,{mode:0o700});
  created=true;
 }catch(error){
  if(error.code!=='EEXIST')throw error;
  let owner=null;
  try{owner=await readOwner(projectRoot,ownerRelative);}catch{}
  const details=owner&&typeof owner==='object'?`pid=${owner.pid??'unknown'}, at=${owner.at??'unknown'}, action=${owner.action??'unknown'}`:'owner metadata unavailable or a legacy lock file still exists';
  const conflict=Error(`${label} lock already running (EEXIST): ${details}; inspect ${displayRelative} and run 'ps -p <pid>' before removing a confirmed stale lock`);
  conflict.code='EEXIST';conflict.owner=owner;throw conflict;
 }

 const ownerFile=path.join(projectRoot,ownerRelative);
 let handle,ownerStat=null;
 try{
  await assertDirectoryIdentityVerified(projectRoot,lockRelative,directoryStat);
  handle=await openVerified(projectRoot,ownerRelative,fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_EXCL,0o600);
  // Record identity as soon as the owner file exists. If writing the metadata
  // fails (for example ENOSPC), the catch path can still remove this exact
  // file instead of leaving an empty lock directory that blocks recovery.
  ownerStat=await handle.stat();
  const token=randomUUID();
  const owner={pid:process.pid,at:new Date().toISOString(),action,token};
  await handle.writeFile(JSON.stringify(owner));
  ownerStat=await handle.stat();
  await assertDirectoryIdentityVerified(projectRoot,lockRelative,directoryStat);
  return {file,ownerFile,handle,token,owner,directoryStat,ownerStat:{dev:ownerStat.dev,ino:ownerStat.ino},root:projectRoot,lockRelative,ownerRelative};
 }catch(error){
  if(handle)await handle.close().catch(()=>{});
  if(ownerStat)await unlinkVerified(projectRoot,ownerRelative,ownerStat).catch(()=>{});
  if(created&&directoryStat)await removeDirectoryVerified(projectRoot,lockRelative,directoryStat).catch(()=>{});
  throw error;
 }
}

export async function releaseFileLock(lock){
 if(!lock)return;
 if(lock.handle){const handle=lock.handle;lock.handle=null;await handle.close();}
 try{
  await assertDirectoryIdentityVerified(lock.root,lock.lockRelative,lock.directoryStat);
  let owner;
  try{owner=await readOwner(lock.root,lock.ownerRelative);}
  catch(error){if(error.code==='ENOENT')return;throw error;}
  if(owner?.token!==lock.token)return;
  let opened;
  try{
   const handle=await openVerified(lock.root,lock.ownerRelative,fsConstants.O_RDONLY);
   try{opened=await readHandleVerified(lock.root,lock.ownerRelative,handle,{maxBytes:64*1024});}finally{await handle.close();}
  }catch(error){if(error.code==='ENOENT'||error.code==='EPATHCHANGED')return;throw error;}
  const parsed=JSON.parse(opened.toString('utf8'));
  if(parsed?.token!==lock.token)return;
  const statHandle=await openVerified(lock.root,lock.ownerRelative,fsConstants.O_RDONLY);
  let stat;
  try{stat=await statHandle.stat();}finally{await statHandle.close();}
  if(!sameIdentity(stat,lock.ownerStat))return;
  await unlinkVerified(lock.root,lock.ownerRelative,stat);
  // Non-recursive removal fails closed if another owner appears between the
  // identity check and rmdir; a replacement directory is never recursively removed.
  await removeDirectoryVerified(lock.root,lock.lockRelative,lock.directoryStat);
 }catch(error){if(error.code==='ENOENT'||error.code==='EPATHCHANGED')return;throw error;}
}

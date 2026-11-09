import {constants,promises as fs} from 'node:fs';
import path from 'node:path';

const noFollow=process.platform==='win32'?0:constants.O_NOFOLLOW;

function pathChanged(relative,detail){
 const error=Error(`Path changed during secure file operation: ${relative}${detail?` (${detail})`:''}`);
 error.code='EPATHCHANGED';
 return error;
}

function sameIdentity(left,right){return left.dev===right.dev&&left.ino===right.ino;}

export async function safePath(root,relative){
 const dest=path.resolve(root,relative);
 if(dest!==root&&!dest.startsWith(root+path.sep))throw Error('Path outside workspace');
 let current=root;
 for(const part of path.relative(root,dest).split(path.sep).filter(Boolean)){
  current=path.join(current,part);
  try{if((await fs.lstat(current)).isSymbolicLink())throw Error(`Symlink forbidden: ${relative}`);}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
 return dest;
}

async function parentChain(root,relative){
 const base=path.resolve(root),dest=await safePath(base,relative),parts=path.relative(base,dest).split(path.sep).filter(Boolean);
 if(!parts.length)throw Error('Secure file operation requires a file path');
 const dirs=[base];let current=base;
 for(const part of parts.slice(0,-1)){current=path.join(current,part);dirs.push(current);}
 const chain=[];
 for(const dir of dirs){
  let stat;
  try{stat=await fs.lstat(dir);}
  catch(error){
   if(error.code==='ENOENT'){const missing=Error(`ENOENT: missing parent ${dir}`);missing.code='ENOENT';missing.path=dir;throw missing;}
   throw error;
  }
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error(`Unsafe parent path: ${dir}`);
  chain.push({path:dir,dev:stat.dev,ino:stat.ino});
 }
 return {dest,chain};
}

async function assertParentChain(snapshot,relative){
 for(const entry of snapshot.chain){
  let stat;
  try{stat=await fs.lstat(entry.path);}
  catch(error){if(error.code==='ENOENT')throw pathChanged(relative,`parent disappeared ${entry.path}`);throw error;}
  if(stat.isSymbolicLink()||!stat.isDirectory()||!sameIdentity(stat,entry))throw pathChanged(relative,`parent replaced ${entry.path}`);
 }
}

async function assertOpenedFile(snapshot,opened,relative){
 let stat;
 try{stat=await fs.lstat(snapshot.dest);}
 catch(error){if(error.code==='ENOENT')throw pathChanged(relative,'file disappeared');throw error;}
 if(stat.isSymbolicLink()||!stat.isFile()||!sameIdentity(stat,opened))throw pathChanged(relative,'opened file no longer matches its path');
}

/** Open a workspace file and fail closed if its ancestors or final path are replaced. */
export async function openVerified(root,relative,flags,mode){
 const snapshot=await parentChain(root,relative);
 let handle,opened=null;
 try{
  handle=await fs.open(snapshot.dest,flags|noFollow,mode);
  opened=await handle.stat();
  if(!opened.isFile())throw Error(`Expected a regular file: ${relative}`);
  await assertParentChain(snapshot,relative);
  await assertOpenedFile(snapshot,opened,relative);
  await assertParentChain(snapshot,relative);
  return handle;
 }catch(error){
  if(handle)await handle.close().catch(()=>{});
  if(opened&&(flags&constants.O_CREAT))await unlinkVerified(root,relative,opened).catch(()=>{});
  throw error;
 }
}

export async function readTextVerified(root,relative){
 const handle=await openVerified(root,relative,constants.O_RDONLY);
 try{return await handle.readFile('utf8');}finally{await handle.close();}
}

export async function readBufferVerified(root,relative){
 const handle=await openVerified(root,relative,constants.O_RDONLY);
 try{return await handle.readFile();}finally{await handle.close();}
}

/** Rename a verified file only after confirming both paths still resolve into the workspace. */
export async function renameVerified(root,fromRelative,toRelative,opened){
 const from=await parentChain(root,fromRelative),to=await parentChain(root,toRelative);
 await assertParentChain(from,fromRelative);await assertParentChain(to,toRelative);
 let source;
 try{source=await fs.lstat(from.dest);}
 catch(error){if(error.code==='ENOENT')throw pathChanged(fromRelative,'source disappeared');throw error;}
 if(source.isSymbolicLink()||!source.isFile()||!sameIdentity(source,opened))throw pathChanged(fromRelative,'source no longer matches the opened file');
 await fs.rename(from.dest,to.dest);
 await assertParentChain(from,fromRelative);await assertParentChain(to,toRelative);
 const final=await fs.lstat(to.dest);
 if(final.isSymbolicLink()||!final.isFile()||!sameIdentity(final,opened))throw pathChanged(toRelative,'renamed file no longer matches the opened file');
 return final;
}

/** Remove a file only when it still has the identity observed through a verified handle. */
export async function unlinkVerified(root,relative,opened){
 if(!opened)return;
 try{
  const snapshot=await parentChain(root,relative);
  await assertParentChain(snapshot,relative);
  const stat=await fs.lstat(snapshot.dest);
  if(stat.isSymbolicLink()||!stat.isFile()||!sameIdentity(stat,opened))return;
  await fs.unlink(snapshot.dest);
  await assertParentChain(snapshot,relative);
 }catch(error){
  if(error.code==='ENOENT'||error.code==='EPATHCHANGED')return;
  throw error;
 }
}

import {constants,promises as fs} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

const noFollow=process.platform==='win32'?0:constants.O_NOFOLLOW;
const MAX_DEFAULT_READ_BYTES=64*1024*1024;
const READ_CHUNK_BYTES=64*1024;

function pathChanged(relative,detail){
 const error=Error(`Path changed during secure file operation: ${relative}${detail?` (${detail})`:''}`);
 error.code='EPATHCHANGED';
 return error;
}

function sameIdentity(left,right){return left.dev===right.dev&&left.ino===right.ino;}

export function sameDirectoryIdentity(left,right){return Boolean(left&&right&&left.dev===right.dev&&left.ino===right.ino);}

function sameDirectoryEntries(left,right){
 if(left.length!==right.length)return false;
 const signature=entry=>`${entry.name}\0${entry.isFile()?'f':entry.isDirectory()?'d':entry.isSymbolicLink()?'l':'o'}`;
 const leftNames=left.map(signature).sort();
 const rightNames=right.map(signature).sort();
 return leftNames.every((value,index)=>value===rightNames[index]);
}

function outsideRoot(root,dest){
 const relative=path.relative(root,dest);
 return relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative);
}

export async function safePath(root,relative){
 if(typeof relative!=='string'||relative.includes('\0'))throw Error('Path must be a workspace-relative string');
 const base=path.resolve(root),dest=path.resolve(base,relative);
 if(outsideRoot(base,dest))throw Error('Path outside workspace');
 let current=base;
 for(const part of path.relative(base,dest).split(path.sep).filter(Boolean)){
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

async function directoryChain(root,relative){
 const base=path.resolve(root),normalized=relative===''?'.':relative,dest=await safePath(base,normalized);
 const parts=path.relative(base,dest).split(path.sep).filter(Boolean);
 const dirs=[base],chain=[];
 let current=base;
 for(const part of parts){current=path.join(current,part);dirs.push(current);}
 for(const dir of dirs){
  let stat;
  try{stat=await fs.lstat(dir);}
  catch(error){if(error.code==='ENOENT'){const missing=Error(`ENOENT: missing directory ${dir}`);missing.code='ENOENT';missing.path=dir;throw missing;}throw error;}
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error(`Unsafe directory path: ${normalized}`);
  chain.push({path:dir,dev:stat.dev,ino:stat.ino});
 }
 return {dest,chain,relative:normalized};
}

async function assertDirectoryChain(snapshot,label){
 for(const entry of snapshot.chain){
  let stat;
  try{stat=await fs.lstat(entry.path);}
  catch(error){if(error.code==='ENOENT')throw pathChanged(label,`directory disappeared ${entry.path}`);throw error;}
  if(stat.isSymbolicLink()||!stat.isDirectory()||!sameIdentity(stat,entry))throw pathChanged(label,`directory replaced ${entry.path}`);
 }
}

async function assertOpenedFile(snapshot,opened,relative){
 let stat;
 try{stat=await fs.lstat(snapshot.dest);}
 catch(error){if(error.code==='ENOENT')throw pathChanged(relative,'file disappeared');throw error;}
 if(stat.isSymbolicLink()||!stat.isFile()||!sameIdentity(stat,opened))throw pathChanged(relative,'opened file no longer matches its path');
}

async function readPrefixVerified(root,relative,handle,{maxBytes=1024*1024}={}){
 const identityBefore=await handle.stat();
 if(!identityBefore.isFile())throw Error(`Expected a regular file: ${relative}`);
 const before=await handle.stat({bigint:true});
 const length=Math.min(Number(before.size),maxBytes);
 const buffer=Buffer.alloc(length);
 const {bytesRead}=await handle.read(buffer,0,length,0);
 const identityAfter=await handle.stat();
 const after=await handle.stat({bigint:true});
 if(!sameIdentity(identityBefore,identityAfter)||readStateChanged(before,after))throw pathChanged(relative,'file changed while being read');
 await assertOpenedPath(root,relative,identityAfter);
 return buffer.subarray(0,bytesRead);
}

/** Reconfirm that a previously opened file is still the file reachable at relative. */
export async function assertOpenedPath(root,relative,opened){
 if(!opened)throw Error('Opened file identity is required');
 const snapshot=await parentChain(root,relative);
 await assertParentChain(snapshot,relative);
 await assertOpenedFile(snapshot,opened,relative);
 await assertParentChain(snapshot,relative);
 return snapshot.dest;
}

function readStateChanged(before,after){
 return before.size!==after.size||before.mode!==after.mode||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs;
}

/** Read through an already verified handle and fail if the file changes during the read. */
export async function readHandleVerified(root,relative,handle,{maxBytes=MAX_DEFAULT_READ_BYTES}={}){
 // lstat() and handle.stat() use Number-valued dev/ino; BigInt stats are only
 // used for nanosecond timestamps. Keep the identity and metadata checks
 // separate so strict comparisons never mix Number and BigInt values.
 if(maxBytes!==null&&(!Number.isSafeInteger(maxBytes)||maxBytes<0))throw Error('maxBytes must be a non-negative safe integer or null');
 const identityBefore=await handle.stat();
 if(!identityBefore.isFile())throw Error(`Expected a regular file: ${relative}`);
 const before=await handle.stat({bigint:true});
 if(maxBytes!==null&&before.size>BigInt(maxBytes))throw Error(`Input exceeds ${maxBytes} byte limit`);
 await assertOpenedPath(root,relative,identityBefore);
 const chunks=[];let bytes=0;
 while(true){
  // Read one byte past the limit when the caller supplied one. This detects a
  // file that grows after the pre-read stat without ever buffering more than
  // maxBytes + one chunk.
  const remaining=maxBytes===null?READ_CHUNK_BYTES:Math.min(READ_CHUNK_BYTES,maxBytes-bytes+1);
  if(remaining<=0)throw Error(`Input exceeds ${maxBytes} byte limit`);
  const chunk=Buffer.allocUnsafe(remaining);
  const {bytesRead}=await handle.read(chunk,0,remaining,bytes);
  if(bytesRead===0)break;
  bytes+=bytesRead;
  if(maxBytes!==null&&bytes>maxBytes)throw Error(`Input exceeds ${maxBytes} byte limit`);
  chunks.push(Buffer.from(chunk.subarray(0,bytesRead)));
 }
 const buffer=Buffer.concat(chunks,bytes);
 const identityAfter=await handle.stat();
 const after=await handle.stat({bigint:true});
 if(!sameIdentity(identityBefore,identityAfter)||readStateChanged(before,after)||after.size!==BigInt(buffer.byteLength))throw pathChanged(relative,'file changed while being read');
 await assertOpenedPath(root,relative,identityAfter);
 return buffer;
}

/** Open a workspace file and fail closed if its ancestors or final path are replaced. */
export async function openVerified(root,relative,flags,mode){
 const snapshot=await parentChain(root,relative);
 let handle,opened=null;
 const exclusiveCreation=Boolean((flags&constants.O_CREAT)&&(flags&constants.O_EXCL));
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
  // Only O_EXCL guarantees that this invocation created the path. Never clean up
  // a pre-existing append/update target after a validation failure.
  if(opened&&exclusiveCreation)await unlinkVerified(root,relative,opened).catch(()=>{});
  throw error;
 }
}

export async function readTextVerified(root,relative,options){
 const buffer=await readBufferVerified(root,relative,options);
 return buffer.toString('utf8');
}

export async function readBufferVerified(root,relative,options){
 const handle=await openVerified(root,relative,constants.O_RDONLY);
 try{return await readHandleVerified(root,relative,handle,options);}finally{await handle.close();}
}

export async function readPrefixBufferVerified(root,relative,options){
 const handle=await openVerified(root,relative,constants.O_RDONLY);
 try{return await readPrefixVerified(root,relative,handle,options);}finally{await handle.close();}
}

/** List a directory only when its path remains the same directory before and after the read. */
export async function readDirectoryVerified(root,relative,{maxEntries=10000,label=relative||'.'}={}){
 const snapshot=await directoryChain(root,relative);
 await assertDirectoryChain(snapshot,label);
 const entries=await fs.readdir(snapshot.dest,{withFileTypes:true});
 if(entries.length>maxEntries)throw Error(`Directory has too many entries (${entries.length} > ${maxEntries}): ${label}`);
 await assertDirectoryChain(snapshot,label);
 // Read the directory a second time and compare the entry set. A single
 // readdir can return an internally consistent list even if entries are
 // swapped during the call; the paired read fails closed instead.
 const entriesAfter=await fs.readdir(snapshot.dest,{withFileTypes:true});
 if(entriesAfter.length>maxEntries)throw Error(`Directory has too many entries (${entriesAfter.length} > ${maxEntries}): ${label}`);
 await assertDirectoryChain(snapshot,label);
 if(!sameDirectoryEntries(entries,entriesAfter))throw pathChanged(label,'directory entries changed while listing');
 return entriesAfter;
}

/** Return whether a workspace path exists without following symlinks. */
export async function pathExistsVerified(root,relative){
 let snapshot;
 try{snapshot=await parentChain(root,relative);}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
 try{
  const stat=await fs.lstat(snapshot.dest);
  if(stat.isSymbolicLink())throw Error(`Symlink forbidden: ${relative}`);
  await assertParentChain(snapshot,relative);
  return true;
 }catch(error){if(error.code==='ENOENT')return false;throw error;}
}

/** Return a verified lstat for an existing regular file or directory. */
export async function lstatVerified(root,relative){
 if(relative===''||relative==='.'){
  const snapshot=await directoryChain(root,'.');
  await assertDirectoryChain(snapshot,'.');
  const stat=await fs.lstat(snapshot.dest);
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Unsafe workspace root');
  await assertDirectoryChain(snapshot,'.');
  return stat;
 }
 const snapshot=await parentChain(root,relative);
 await assertParentChain(snapshot,relative);
 const stat=await fs.lstat(snapshot.dest);
 if(stat.isSymbolicLink())throw Error(`Symlink forbidden: ${relative}`);
 await assertParentChain(snapshot,relative);
 return stat;
}

/** Create one workspace directory only after verifying its existing parent chain. */
export async function createDirectoryVerified(root,relative,{mode=0o700}={}){
 const snapshot=await parentChain(root,relative);
 await assertParentChain(snapshot,relative);
 await fs.mkdir(snapshot.dest,{mode});
 const stat=await fs.lstat(snapshot.dest);
 if(stat.isSymbolicLink()||!stat.isDirectory())throw pathChanged(relative,'created path is not a regular directory');
 await assertParentChain(snapshot,relative);
 const after=await fs.lstat(snapshot.dest);
 if(after.isSymbolicLink()||!after.isDirectory()||!sameDirectoryIdentity(stat,after))throw pathChanged(relative,'created directory was replaced');
 return after;
}

/** Create or verify each component of a workspace-relative directory path. */
export async function ensureDirectoryVerified(root,relative,{mode=0o700}={}){
 if(typeof relative!=='string'||relative.includes('\0')||path.isAbsolute(relative)||relative.split(/[\\/]/).includes('..'))throw Error('Directory must be a safe workspace-relative path');
 const normalized=relative.replaceAll('\\','/').replace(/^\.\//,'').replace(/\/+$/,'');
 if(!normalized||normalized==='.'){
  const stat=await fs.lstat(path.resolve(root));
  if(stat.isSymbolicLink()||!stat.isDirectory())throw Error(`Unsafe directory path: ${relative}`);
  return stat;
 }
 let current='',stat=null;
 for(const part of normalized.split('/').filter(Boolean)){
  current=current?`${current}/${part}`:part;
  try{stat=await lstatVerified(root,current);}
  catch(error){if(error.code!=='ENOENT')throw error;stat=null;}
  if(!stat)stat=await createDirectoryVerified(root,current,{mode});
  else if(stat.isSymbolicLink()||!stat.isDirectory())throw Error(`Unsafe directory path: ${current}`);
 }
 return stat;
}

/** Confirm that a directory still has the identity observed when it was created or acquired. */
export async function assertDirectoryIdentityVerified(root,relative,expected){
 if(!expected)throw Error('Directory identity is required');
 const snapshot=await parentChain(root,relative);
 await assertParentChain(snapshot,relative);
 const stat=await fs.lstat(snapshot.dest);
 if(stat.isSymbolicLink()||!stat.isDirectory()||!sameDirectoryIdentity(stat,expected))throw pathChanged(relative,'directory no longer matches the acquired identity');
 await assertParentChain(snapshot,relative);
 return stat;
}

/** Remove only a directory whose identity still matches and which is still empty. */
export async function removeDirectoryVerified(root,relative,opened){
 if(!opened)return false;
 try{
  await assertDirectoryIdentityVerified(root,relative,opened);
  await fs.rmdir(await safePath(root,relative));
  return true;
 }catch(error){
  if(['ENOENT','ENOTEMPTY','EEXIST','EPATHCHANGED'].includes(error.code))return false;
  throw error;
 }
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

/** Rename a verified directory. An existing empty destination may only be
 * replaced when its identity is explicitly supplied by the caller. */
export async function renameDirectoryVerified(root,fromRelative,toRelative,expected,{replaceExpected=null}={}){
 if(!expected)throw Error('Directory identity is required');
 const from=await parentChain(root,fromRelative),to=await parentChain(root,toRelative);
 await assertParentChain(from,fromRelative);await assertParentChain(to,toRelative);
 const source=await fs.lstat(from.dest);
 if(source.isSymbolicLink()||!source.isDirectory()||!sameDirectoryIdentity(source,expected))throw pathChanged(fromRelative,'source directory no longer matches the acquired identity');
 let destination=null;
 try{destination=await fs.lstat(to.dest);}
 catch(error){if(error.code!=='ENOENT')throw error;}
 if(destination){
  if(destination.isSymbolicLink()||!destination.isDirectory())throw pathChanged(toRelative,'destination is not a regular directory');
  if(!replaceExpected||!sameDirectoryIdentity(destination,replaceExpected))throw pathChanged(toRelative,'destination changed before rename');
 }
 await fs.rename(from.dest,to.dest);
 await assertParentChain(to,toRelative);
 const final=await fs.lstat(to.dest);
 if(final.isSymbolicLink()||!final.isDirectory()||!sameDirectoryIdentity(final,expected))throw pathChanged(toRelative,'renamed directory no longer matches the source identity');
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

/** Open, identity-check and remove an existing file without deleting a replacement. */
export async function removeFileVerified(root,relative,{expected=null}={}){
 let handle;
 try{
  handle=await openVerified(root,relative,constants.O_RDONLY);
  const opened=await handle.stat();
  if(expected&&!sameIdentity(opened,expected))return false;
  await unlinkVerified(root,relative,opened);
  return true;
 }catch(error){
  if(error.code==='ENOENT'||error.code==='EPATHCHANGED')return false;
  throw error;
 }finally{
  if(handle)await handle.close().catch(()=>{});
 }
}

/**
 * Write a workspace file through a verified parent chain. The default is an
 * exclusive create. Replacement uses a same-directory temporary file and a
 * verified rename so a final-path symlink is replaced rather than followed.
 */
export async function writeFileVerified(root,relative,data,{mode=0o600,overwrite=false,maxBytes=16*1024*1024}={}){
 if(typeof relative!=='string'||!relative||path.isAbsolute(relative)||relative.includes('\0')||relative.split(/[\\/]/).includes('..'))throw Error('File must be a safe workspace-relative path');
 const buffer=Buffer.isBuffer(data)?data:Buffer.from(String(data),'utf8');
 if(buffer.length>maxBytes)throw Error(`Input exceeds ${maxBytes} byte limit`);
 const normalized=relative.replaceAll('\\','/').replace(/^\.\//,'');
 const parent=path.posix.dirname(normalized);
 await ensureDirectoryVerified(root,'.',{mode:0o700});
 if(parent!=='.')await ensureDirectoryVerified(root,parent,{mode:0o700});
 if(!overwrite){
  const handle=await openVerified(root,normalized,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,mode);
  let opened=null;
  try{
   opened=await handle.stat();
   await handle.writeFile(buffer);
   await assertOpenedPath(root,normalized,opened);
   return await handle.stat();
  }catch(error){
   if(opened)await unlinkVerified(root,normalized,opened).catch(()=>{});
   throw error;
  }finally{await handle.close();}
 }
 const temp=`${normalized}.${randomUUID()}.tmp`;
 let stat=null;
 try{
  const handle=await openVerified(root,temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,mode);
  try{await handle.writeFile(buffer);stat=await handle.stat();}finally{await handle.close();}
  await renameVerified(root,temp,normalized,stat);
  stat=null;
  return await lstatVerified(root,normalized);
 }finally{
  if(stat)await unlinkVerified(root,temp,stat).catch(()=>{});
 }
}

function entrySignature(entry){
 return `${entry.name}\0${entry.isFile()?'f':entry.isDirectory()?'d':entry.isSymbolicLink()?'l':'o'}`;
}

function sameEntrySet(left,right){
 if(left.length!==right.length)return false;
 const a=left.map(entrySignature).sort(),b=right.map(entrySignature).sort();
 return a.every((value,index)=>value===b[index]);
}

/**
 * Copy a workspace tree without following links. Source and destination must be
 * in the same verified workspace. This is not an atomic filesystem snapshot; it
 * fails if entries appear or disappear while the copy is in progress.
 */
export async function copyTreeVerified(root,fromRelative,toRelative,{maxFiles=50000,maxBytes=512*1024*1024,maxDepth=64,label='tree copy'}={}){
 let files=0,bytes=0;
 async function copyDirectory(from,to,depth){
  if(depth>maxDepth)throw Error(`${label} exceeds maximum depth ${maxDepth}`);
  const before=await readDirectoryVerified(root,from,{maxEntries:10000,label:`${label} source ${from}`});
  await ensureDirectoryVerified(root,to,{mode:0o700});
  for(const entry of before){
   if(entry.isSymbolicLink())throw Error(`${label} does not support symlinks: ${from}/${entry.name}`);
   const source=from==='.'?entry.name:`${from}/${entry.name}`;
   const target=to==='.'?entry.name:`${to}/${entry.name}`;
   if(entry.isDirectory()){await copyDirectory(source,target,depth+1);continue;}
   if(!entry.isFile())throw Error(`${label} does not support special files: ${source}`);
   if(++files>maxFiles)throw Error(`${label} exceeds ${maxFiles} files`);
   const handle=await openVerified(root,source,constants.O_RDONLY);
   let buffer,sourceStat;
   try{
    sourceStat=await handle.stat();
    buffer=await readHandleVerified(root,source,handle,{maxBytes:maxBytes-0});
    if(buffer.byteLength>maxBytes-bytes)throw Error(`${label} exceeds ${maxBytes} bytes`);
    bytes+=buffer.byteLength;
    const targetHandle=await openVerified(root,target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,sourceStat.mode&0o777||0o600);
    try{
     await targetHandle.writeFile(buffer);
     await targetHandle.chmod(sourceStat.mode&0o777);
    }finally{await targetHandle.close();}
   }finally{await handle.close();}
  }
  const after=await readDirectoryVerified(root,from,{maxEntries:10000,label:`${label} source ${from}`});
  if(!sameEntrySet(before,after))throw pathChanged(from,'source entries changed during copy');
 }
 await copyDirectory(fromRelative,toRelative,0);
 return {files,bytes};
}

/** Recursively remove a workspace tree while refusing links and changing entries. */
export async function removeTreeVerified(root,relative,{expected=null,maxFiles=50000,maxDepth=64,label='tree removal'}={}){
 let files=0;
 async function removeDirectory(current,depth,identity){
  if(depth>maxDepth)throw Error(`${label} exceeds maximum depth ${maxDepth}`);
  if(identity)await assertDirectoryIdentityVerified(root,current,identity);
  const entries=await readDirectoryVerified(root,current,{maxEntries:10000,label:`${label} ${current}`});
  for(const entry of entries){
   const child=current==='.'?entry.name:`${current}/${entry.name}`;
   const stat=await lstatVerified(root,child).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
   if(!stat)continue;
   if(stat.isSymbolicLink())throw Error(`${label} refuses symlink: ${child}`);
   if(stat.isDirectory())await removeDirectory(child,depth+1,stat);
   else if(stat.isFile()){
    if(++files>maxFiles)throw Error(`${label} exceeds ${maxFiles} files`);
    await removeFileVerified(root,child,{expected:stat});
   }else throw Error(`${label} refuses special file: ${child}`);
  }
  const remaining=await readDirectoryVerified(root,current,{maxEntries:10000,label:`${label} ${current}`});
  if(remaining.length)throw pathChanged(current,'entries changed during removal');
  if(identity)await removeDirectoryVerified(root,current,identity);
  else await fs.rmdir(await safePath(root,current));
 }
 let rootStat;
 try{rootStat=await lstatVerified(root,relative);}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
 if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw Error(`${label} expected a directory: ${relative}`);
 if(expected&&!sameDirectoryIdentity(rootStat,expected))throw pathChanged(relative,'directory no longer matches the acquired identity');
 await removeDirectory(relative,0,expected||rootStat);
 return true;
}

import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { FileSystemUtils } from '../utils/file-system.js';
import { ensureDirectoryVerified, openVerified, readBufferVerified } from '../../../shared/path-safety.mjs';
import { acquireFileLock, releaseFileLock } from '../../../shared/file-lock.mjs';

const MAX_STORE_FILE_BYTES = 16 * 1024 * 1024;
export function identifier(value:string, nested=false): string {
  if (!(nested ? /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/ : /^[a-z0-9]+(?:-[a-z0-9]+)*$/).test(value) || value === 'archive') throw new Error(`Invalid identifier: ${value}`);
  return value;
}
export function safe(root:string, ...parts:string[]):string {
  const target=path.resolve(root,...parts); FileSystemUtils.assertPathWithin(root,target); return target;
}
function relativeTo(root:string,file:string):string {
  const relative=path.relative(path.resolve(root),path.resolve(file));
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))throw new Error('Path escapes root');
  return relative.split(path.sep).join('/');
}
export async function read(root:string,file:string):Promise<string> {
  return (await readBufferVerified(root,relativeTo(root,file),{maxBytes:MAX_STORE_FILE_BYTES})).toString('utf8');
}
export async function write(root:string,relative:string,content:string):Promise<void> {
  const normalized=relative.split(path.sep).join('/');
  const parent=path.posix.dirname(normalized);
  await ensureDirectoryVerified(root,'.',{mode:0o700});
  if(parent!=='.')await ensureDirectoryVerified(root,parent,{mode:0o700});
  const buffer=Buffer.from(content,'utf8');
  if(buffer.length>MAX_STORE_FILE_BYTES)throw new Error(`Store file exceeds ${MAX_STORE_FILE_BYTES} byte limit`);
  const handle=await openVerified(root,normalized,fsConstants.O_WRONLY|fsConstants.O_CREAT|fsConstants.O_EXCL,0o600);
  try{await handle.writeFile(buffer);}finally{await handle.close();}
}
export async function locked<T>(root:string, action:()=>Promise<T>):Promise<T> {
  await ensureDirectoryVerified(root,'.',{mode:0o700});
  const file=safe(root,'.lock');
  const lock=await acquireFileLock(file,{root,relative:'.lock',action:'OpenSpec store mutation',label:'OpenSpec store'});
  try { return await action(); } finally { await releaseFileLock(lock); }
}

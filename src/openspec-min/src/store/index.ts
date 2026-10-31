import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemUtils } from '../utils/file-system.js';
export function identifier(value:string, nested=false): string {
  if (!(nested ? /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/ : /^[a-z0-9]+(?:-[a-z0-9]+)*$/).test(value) || value === 'archive') throw new Error(`Invalid identifier: ${value}`);
  return value;
}
export function safe(root:string, ...parts:string[]):string {
  const target=path.resolve(root,...parts); FileSystemUtils.assertPathWithin(root,target); return target;
}
export async function read(file:string):Promise<string> { return fs.readFile(file,'utf8'); }
export async function write(root:string,relative:string,content:string):Promise<void> {
  const file=safe(root,relative); await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,content,{flag:'wx'});
}
export async function locked<T>(root:string, action:()=>Promise<T>):Promise<T> {
  safe(root); await fs.mkdir(root,{recursive:true}); const file=safe(root,'.lock');
  const handle=await fs.open(file,'wx');
  try { return await action(); } finally { await handle.close(); await fs.unlink(file); }
}

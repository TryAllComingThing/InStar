import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileSystemUtils } from './file-system.js';
export async function discoverSpecFiles(root: string): Promise<{id: string; specFile: string}[]> {
  const result: {id: string; specFile: string}[] = [];
  try {
    const stat = await fs.lstat(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe spec directory: ${root}`);
  } catch(error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  async function visit(dir: string) {
    FileSystemUtils.assertPathWithin(root, dir);
    let entries;
    try { entries = await fs.readdir(dir, {withFileTypes:true}); }
    catch(error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = path.join(dir,entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are unsupported: ${file}`);
      if (entry.isDirectory()) await visit(file);
      else if (entry.name === 'spec.md' && dir !== root) {
        const stat = await fs.lstat(file);
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Unsafe spec file: ${file}`);
        result.push({id:path.relative(root,dir).split(path.sep).join('/'),specFile:file});
      }
      else throw new Error(`Unexpected spec file: ${file}`);
    }
  }
  await visit(root); return result;
}

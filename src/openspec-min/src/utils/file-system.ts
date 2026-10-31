import { realpathSync, lstatSync } from 'node:fs';
import path from 'node:path';
export class FileSystemUtils {
  static canonicalizeExistingPath(p: string): string { try { return realpathSync(p); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return path.resolve(p); } }
  static assertPathWithin(root: string, target: string): void {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Path escapes root');
    let current = path.resolve(root);
    for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
      current = path.join(current, part);
      try { if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlinks are unsupported: ${current}`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
}

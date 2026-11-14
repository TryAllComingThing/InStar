import path from 'node:path';
import type { Dirent } from 'node:fs';
import { readDirectoryVerified } from '../../../shared/path-safety.mjs';

export async function discoverSpecFiles(root: string): Promise<{id: string; specFile: string}[]> {
  const result: {id: string; specFile: string}[] = [];
  const base = path.resolve(root);

  // Distinguish a missing optional specs directory from a directory that
  // changes or becomes unsafe during the scan. Later reads must fail closed.
  try {
    await readDirectoryVerified(base, '.', {label: 'spec directory'});
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  async function visit(relative: string): Promise<void> {
    const entries: Dirent<string>[] = await readDirectoryVerified(base, relative, {
      label: relative === '.' ? 'spec directory' : `spec directory ${relative}`,
    });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const child = relative === '.' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are unsupported: ${child}`);
      if (entry.isDirectory()) {
        await visit(child);
        continue;
      }
      if (entry.name !== 'spec.md' || relative === '.') {
        throw new Error(`Unexpected spec file: ${child}`);
      }
      if (!entry.isFile()) throw new Error(`Unsafe spec file: ${child}`);
      result.push({ id: relative, specFile: path.join(base, ...child.split('/')) });
    }
  }

  await visit('.');
  return result;
}

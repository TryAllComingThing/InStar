import {copyFile, lstat, mkdir, readdir, rename, rm} from 'node:fs/promises';
import path from 'node:path';

const sensitive = name => /(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/.test(name);

/**
 * Copy a repository-owned tree without following links or admitting credential
 * paths. `filter` receives the slash-separated path relative to `source`.
 */
export async function copyTree(source, destination, {filter = () => true, label = 'copy'} = {}) {
  async function walk(from, to, relative) {
    const stat = await lstat(from);
    if (stat.isSymbolicLink()) throw Error(`${label}: refusing to copy symlink: ${relative || from}`);
    if (stat.isDirectory()) {
      await mkdir(to, {recursive:true});
      for (const entry of (await readdir(from, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
        const child = relative ? `${relative}/${entry.name}` : entry.name;
        if (/(^|\/)\.DS_Store$/.test(child) || !filter(child)) continue;
        await walk(path.join(from, entry.name), path.join(to, entry.name), child);
      }
      return;
    }
    if (!stat.isFile()) throw Error(`${label}: refusing non-regular entry: ${relative}`);
    if (relative.endsWith('.DS_Store') || sensitive(relative)) throw Error(`${label}: refusing sensitive or metadata path: ${relative}`);
    await mkdir(path.dirname(to), {recursive:true});
    await copyFile(from, to);
  }
  await walk(source, destination, '');
}

/** Copy individual paths, retaining only regular non-sensitive files. */
export async function copyFiles(files, destination, {label = 'copy', filter = () => true} = {}) {
  for (const full of files) {
    const relative = full.relative;
    if (!filter(relative)) continue;
    if (relative.endsWith('.DS_Store') || sensitive(relative)) throw Error(`${label}: refusing sensitive or metadata path: ${relative}`);
    const stat = await lstat(full.source);
    if (stat.isSymbolicLink()) throw Error(`${label}: refusing to copy symlink: ${relative}`);
    if (!stat.isFile()) throw Error(`${label}: refusing non-regular entry: ${relative}`);
    const target = path.join(destination, ...relative.split('/'));
    await mkdir(path.dirname(target), {recursive:true});
    await copyFile(full.source, target);
  }
}

export async function replaceDirectory(staging, destination) {
  const backup = `${destination}.previous-${process.pid}`;
  await rm(backup, {recursive:true, force:true});
  let hadDestination = false;
  try { await lstat(destination); hadDestination = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (hadDestination) await rename(destination, backup);
  try { await rename(staging, destination); }
  catch (error) {
    if (hadDestination) await rename(backup, destination).catch(()=>{});
    throw error;
  }
  await rm(backup, {recursive:true, force:true});
}

import {access, lstat, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {copyFiles, copyTree, replaceDirectory} from './copy-safe.mjs';
import {releaseEntries} from './inventory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = path.join(root, 'release');
const staging = path.join(root, `.release-build-${randomUUID()}`);
const plugin = path.join(staging, 'plugins/instar');

async function gitVisibleFiles(entry) {
  const result = spawnSync('git', ['-c','core.fsmonitor=false','ls-files','-z','--cached','--others','--exclude-standard','--deduplicate','--',entry], {cwd:root, encoding:'utf8', timeout:15000, maxBuffer:64*1024*1024});
  if (result.status !== 0 || result.error) throw Error(`Unable to enumerate release entry ${entry}: ${result.error?.message || result.status}`);
  const files=[];
  for(const relative of result.stdout.split('\0').filter(Boolean)){
    const source=path.join(root, ...relative.split('/'));
    try{await lstat(source);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    files.push({relative,source});
  }
  return files;
}

await rm(staging, {recursive:true, force:true});
await mkdir(plugin, {recursive:true});
try {
  for (const name of releaseEntries) {
    const destination = path.join(plugin, name);
    if (name === 'runtime') {
      await copyTree(path.join(root, name), destination, {label:`release/${name}`});
      continue;
    }
    const files = await gitVisibleFiles(name);
    if (!files.length) throw Error(`Release entry has no Git-visible files: ${name}`);
    await copyFiles(files, plugin, {label:`release/${name}`});
  }
  await mkdir(path.join(staging, '.agents/plugins'), {recursive:true});
  await writeFile(path.join(staging, '.agents/plugins/marketplace.json'), JSON.stringify({name:'instar-local',interface:{displayName:'InStar'},plugins:[{name:'instar',source:{source:'local',path:'./plugins/instar'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Development'}]}, null, 2)+'\n');
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(plugin, '.codex-plugin/plugin.json'), 'utf8'));
  if (manifest.name !== 'instar' || manifest.version !== packageJson.version) throw Error('Release manifest name/version does not match package.json');
  await access(path.join(plugin, 'runtime/quality-controller/cli.mjs'));
  await access(path.join(plugin, 'hooks/hooks.json'));
  for (const entry of releaseEntries) {
    const stat = await lstat(path.join(plugin, entry));
    if (stat.isSymbolicLink()) throw Error(`Release contains a symlink: ${entry}`);
  }
  await replaceDirectory(staging, release);
  console.log('Release: release/plugins/instar; marketplace: release/.agents/plugins/marketplace.json');
} catch (error) {
  await rm(staging, {recursive:true, force:true});
  throw error;
}

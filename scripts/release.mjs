import {access, lstat, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {copyTree, replaceDirectory} from './copy-safe.mjs';
import {releaseEntries} from './inventory.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = path.join(root, 'release');
const staging = path.join(root, `.release-build-${randomUUID()}`);
const plugin = path.join(staging, 'plugins/instar');

await rm(staging, {recursive:true, force:true});
await mkdir(plugin, {recursive:true});
try {
  const metadata = relative => /(^|\/)(?:\.git|\.hg|\.svn|\.DS_Store)(?:\/|$)/.test(relative);
  const generated = relative => /(^|\/)(?:node_modules|reports|logs|\.workflow|planning|coverage|dist|build)(?:\/|$)/.test(relative);
  for (const name of releaseEntries) {
    await copyTree(path.join(root, name), path.join(plugin, name), {
      label:`release/${name}`,
      filter:relative => !metadata(relative) && (name === 'runtime' || !generated(relative))
    });
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

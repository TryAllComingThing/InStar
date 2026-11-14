import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {copyTree, replaceDirectory} from './copy-safe.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, 'runtime');
const staging = path.join(root, `.runtime-build-${randomUUID()}`);
const skipRuntimeFile = relative =>
  /(^|\/)\.DS_Store$/.test(relative) ||
  /\.d\.(?:ts|mts|cts)$/.test(relative) ||
  /\.map$/.test(relative) ||
  /\.cjs$/.test(relative) ||
  /(^|\/)(README|CHANGELOG)\.md$/.test(relative);
const zodRoot = path.join(root, 'node_modules/zod');
const zodFilter = relative => {
  if (relative === 'v3' || relative.startsWith('v3/')) return false;
  if (relative === 'locales' || relative.startsWith('locales/')) return false;
  if (relative === 'mini' || relative.startsWith('mini/')) return false;
  if (relative === 'v4-mini' || relative.startsWith('v4-mini/')) return false;
  if (relative === 'v4/mini' || relative.startsWith('v4/mini/')) return false;
  if (/^compile\.(?:js|cjs|d\.ts|d\.mts|d\.cts)$/.test(relative)) return false;
  if (/(^|\/)(src|tests|__tests__)(\/|$)/.test(relative)) return false;
  return !skipRuntimeFile(relative);
};

await rm(staging, {recursive:true, force:true});
await mkdir(staging, {recursive:true});
try {
  await copyTree(path.join(root, 'src/openspec-min/dist'), path.join(staging, 'openspec-min'), {filter:relative=>!skipRuntimeFile(relative), label:'runtime/openspec-min'});
  await copyTree(path.join(root, 'src/openspec-min/artifact-templates'), path.join(staging, 'openspec-min/artifact-templates'), {filter:relative=>!skipRuntimeFile(relative), label:'runtime/openspec-min/artifact-templates'});
  for (const name of ['workflow-controller', 'micro-controller', 'quick-controller', 'shared', 'discovery-controller', 'quality-controller']) {
    await copyTree(path.join(root, 'src', name), path.join(staging, name), {filter:relative=>!skipRuntimeFile(relative), label:`runtime/${name}`});
  }
  await copyTree(path.join(root, 'src/openspec-min/LICENSE'), path.join(staging, 'openspec-min/LICENSE'), {label:'runtime/openspec-min/LICENSE'});
  await copyTree(zodRoot, path.join(staging, 'openspec-min/node_modules/zod'), {filter:zodFilter, label:'runtime/openspec-min/node_modules/zod'});
  const zodPackage = path.join(staging, 'openspec-min/node_modules/zod/package.json');
  const zodManifest = JSON.parse(await readFile(zodPackage, 'utf8'));
  for (const subpath of ['./mini','./compile','./locales','./v3','./v4-mini','./v4/mini']) delete zodManifest.exports?.[subpath];
  await writeFile(zodPackage, `${JSON.stringify(zodManifest, null, 2)}\n`);
  await copyTree(path.join(root, 'node_modules/smol-toml'), path.join(staging, 'node_modules/smol-toml'), {filter:relative=>!skipRuntimeFile(relative), label:'runtime/node_modules/smol-toml'});
  await writeFile(path.join(staging, 'package.json'), ' {"type":"module"}\n');
  await replaceDirectory(staging, runtime);
  console.log('Built standalone runtime, including skill resources and dependency.');
} catch (error) {
  await rm(staging, {recursive:true, force:true});
  throw error;
}

import {cp, rm} from 'node:fs/promises';

const source = new URL('../../shared/', import.meta.url);
const target = new URL('../shared/', import.meta.url);
const files = ['path-safety.mjs', 'file-lock.mjs', 'bounded-input.mjs'];

await rm(target, {recursive: true, force: true});
for (const file of files) {
  await cp(new URL(file, source), new URL(file, target));
}

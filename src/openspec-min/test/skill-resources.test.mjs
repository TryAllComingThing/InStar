import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('deployed instructions load full skill resources without the source tree', async t => {
  const isolated = await mkdtemp(path.join(os.tmpdir(), 'openspec-skill-deploy-'));
  t.after(() => rm(isolated, {recursive: true, force: true}));
  await cp(new URL('../dist/', import.meta.url), path.join(isolated, 'dist'), {recursive: true});
  await writeFile(path.join(isolated, 'package.json'), '{"type":"module"}');
  const { instructions } = await import(pathToFileURL(path.join(isolated, 'dist/src/engine/schema/index.js')).href);
  for (const [instruction, skill, templates] of [['propose','openspec-min-propose',['proposal','spec']], ['design','openspec-min-design',['technical-design']], ['tasks','openspec-min-tasks',['tasks']]]) {
    const reference = await readFile(new URL(`../src/skills/${skill}/references/authoring.md`, import.meta.url), 'utf8');
    assert.ok(instructions[instruction].includes(reference), `${instruction} lost authoring rules in deployment`);
    for (const template of templates) {
      const asset = await readFile(new URL(`../src/skills/${skill}/assets/${template}.md`, import.meta.url), 'utf8');
      assert.ok(instructions[instruction].includes(asset), `${instruction} lost its ${template} template in deployment`);
    }
    assert.doesNotMatch(instructions[instruction], /openspec (?:list|instructions|status|validate)|--store/);
  }
});

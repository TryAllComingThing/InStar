import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {validateSkills, fileExists} from '../scripts/skill-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('native Skills satisfy the Agent Skills contract', async () => {
  const {names} = await validateSkills(path.join(root, 'skills'));
  assert.equal(names.length, 22);
  assert(await fileExists(path.join(root, 'skills/extract-design-md/assets/DESIGN.md')));
  assert(!(await fileExists(path.join(root, 'skills/extract-design-md/examples/DESIGN.md'))));
});

test('runtime Skill directories match their frontmatter names', async () => {
  const {names} = await validateSkills(path.join(root, 'src/openspec-min/src/skills'), {
    pluginRoot: path.join(root, 'src/openspec-min'),
  });
  assert.deepEqual(names, ['openspec-min-design', 'openspec-min-propose', 'openspec-min-tasks', 'openspec-min-verify']);
});

test('command Skills are thin legacy delegates', async () => {
  for (const name of ['design-check', 'extract-design-md', 'spec-discover']) {
    const text = await readFile(path.join(root, 'commands', `${name}.md`), 'utf8');
    assert.match(text, /Legacy slash-command entry/);
    assert.match(text, /Delegate to the native `\$[a-z-]+` Skill/);
  }
});

test('trigger eval fixture covers priority near-miss pairs', async () => {
  const {names} = await validateSkills(path.join(root, 'skills'));
  const fixture = JSON.parse(await readFile(path.join(root, 'test/skill-trigger-evals.json'), 'utf8'));
  assert.equal(fixture.version, 1);
  assert(fixture.queries.length >= 20);
  const valid = new Set(names);
  for (const item of fixture.queries) {
    assert.equal(typeof item.query, 'string');
    assert(item.query.trim().length > 0);
    assert.equal(typeof item.shouldTrigger, 'boolean');
    assert(item.expected === null || valid.has(item.expected), `Unknown expected Skill: ${item.expected}`);
    if (item.shouldTrigger) assert(item.expected, 'A should-trigger query needs an expected Skill');
    if (!item.shouldTrigger) {
      assert.equal(item.expected, null);
      assert(valid.has(item.nearMiss), `Unknown near-miss Skill: ${item.nearMiss}`);
    }
  }
  for (const [left, right] of fixture.priorityPairs) {
    assert(valid.has(left) && valid.has(right));
    for (const skill of [left, right]) assert(fixture.queries.some(item => item.expected === skill && item.shouldTrigger), `Missing positive trigger for ${skill}`);
    assert(fixture.queries.some(item => !item.shouldTrigger && [left, right].includes(item.nearMiss)), `Missing negative near-miss for ${left}/${right}`);
  }
});

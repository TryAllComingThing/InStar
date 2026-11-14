import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {run as microRun} from '../runtime/micro-controller/index.mjs';

async function project() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'instar-micro-')));
  await mkdir(path.join(root, 'src'), {recursive: true});
  await mkdir(path.join(root, 'test'), {recursive: true});
  await mkdir(path.join(root, 'locales'), {recursive: true});
  await writeFile(path.join(root, '.instar.json'), JSON.stringify({schemaVersion: 1}, null, 2) + '\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({scripts: {}}, null, 2) + '\n');
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 1;\n');
  await writeFile(path.join(root, 'README.md'), '# Fixture\n');
  await writeFile(path.join(root, 'test/app.test.mjs'), "import test from 'node:test';\ntest('fixture', () => {});\n");
  await writeFile(path.join(root, 'locales/en.json'), JSON.stringify({title: 'Fixture'}, null, 2) + '\n');
  return root;
}

const checks = [
  {name: 'test', status: 'passed', evidence: 'node --test test/app.test.mjs'},
  {name: 'code-review', status: 'passed', evidence: 'reviewed documentation and test wording'}
];

test('micro path starts without a brief and accepts documentation, copy and tests once', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  const started = await microRun({
    action: 'start', project: root, changeId: 'micro-docs', title: 'Clarify docs',
    files: ['README.md', 'test/app.test.mjs', 'locales/en.json']
  });
  assert.equal(started.path, 'micro');
  assert.equal(started.stage, 'implementation');
  assert.equal(started.status, 'in-progress');
  assert.equal(started.version, 0);
  assert.equal(started.evidence, null);
  assert.equal(await readFile(path.join(root, '.workflow/micro/micro-docs.json'), 'utf8').then(JSON.parse).then(state => state.path), 'micro');
  await writeFile(path.join(root, 'README.md'), '# Fixture\n\nClearer wording.\n');
  await writeFile(path.join(root, 'test/app.test.mjs'), "import test from 'node:test';\ntest('updated fixture', () => {});\n");
  await writeFile(path.join(root, 'locales/en.json'), JSON.stringify({title: 'Clearer fixture'}, null, 2) + '\n');
  const submitted = await microRun({
    action: 'submit', project: root, changeId: 'micro-docs', expectedVersion: started.version,
    summary: 'Clarified documentation, copy and the test name.', checks
  });
  assert.equal(submitted.stage, 'acceptance');
  assert.deepEqual(submitted.evidence.files, ['README.md', 'locales/en.json', 'test/app.test.mjs']);
  assert.deepEqual(submitted.evidence.risk.impact, ['documentation', 'copy', 'tests']);
  await assert.rejects(microRun({
    action: 'accept', project: root, changeId: 'micro-docs', expectedVersion: submitted.version,
    reviewHash: 'wrong', decision: 'accept-no-record'
  }), /reviewHash/);
  const accepted = await microRun({
    action: 'accept', project: root, changeId: 'micro-docs', expectedVersion: submitted.version,
    reviewHash: submitted.pendingReview.hash, decision: 'accept-record', confirmation: 'accepted in test'
  });
  assert.equal(accepted.status, 'completed');
  assert.equal(accepted.acceptance.recorded, true);
});

test('micro path rejects production code and governed paths at start and submission', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const [changeId, file] of [
    ['micro-code', 'src/app.js'],
    ['micro-package', 'package.json'],
    ['micro-ui', 'src/views/Login.vue']
  ]) {
    await assert.rejects(microRun({
      action: 'start', project: root, changeId, title: 'Unsafe scope', files: [file]
    }), /production code|non-micro impact/);
  }

  const started = await microRun({
    action: 'start', project: root, changeId: 'micro-escape', title: 'Documentation only', files: ['README.md']
  });
  await writeFile(path.join(root, 'README.md'), '# Fixture\n\nChanged.\n');
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 2;\n');
  await assert.rejects(microRun({
    action: 'submit', project: root, changeId: 'micro-escape', expectedVersion: started.version,
    summary: 'Sneaked in production code.', checks
  }), /production code/);
  assert.equal((await microRun({action: 'state', project: root, changeId: 'micro-escape'})).stage, 'implementation');
});

test('micro path observes a workspace baseline and fails closed when it is missing', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(path.join(root, '.instarignore'), 'ignored-cache/\n');
  const started = await microRun({
    action: 'start', project: root, changeId: 'micro-baseline', title: 'Baseline observation', files: ['README.md']
  });
  await writeFile(path.join(root, 'README.md'), '# Fixture\n\nChanged without Git.\n');
  await mkdir(path.join(root, 'ignored-cache'), {recursive: true});
  await writeFile(path.join(root, 'ignored-cache/generated.js'), 'generated');
  const classified = await microRun({action: 'classify', project: root, changeId: 'micro-baseline'});
  assert.equal(classified.mode, 'baseline');
  assert.deepEqual(classified.paths, ['README.md']);
  await rm(path.join(root, '.instar/baselines/micro-baseline.json'));
  await assert.rejects(microRun({
    action: 'submit', project: root, changeId: 'micro-baseline', expectedVersion: started.version,
    summary: 'Baseline disappeared.', checks
  }), /baseline/i);
});

test('micro path rejects failed checks, missing review and oversized diffs', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  const started = await microRun({
    action: 'start', project: root, changeId: 'micro-limits', title: 'Tiny docs change',
    files: ['README.md'], limits: {maxChangedLines: 2}
  });
  await writeFile(path.join(root, 'README.md'), '# Fixture\n\nOne.\nTwo.\n');
  await assert.rejects(microRun({
    action: 'submit', project: root, changeId: 'micro-limits', expectedVersion: started.version,
    summary: 'Failed check.', checks: [{name: 'test', status: 'failed'}, checks[1]]
  }), /status passed/);
  await assert.rejects(microRun({
    action: 'submit', project: root, changeId: 'micro-limits', expectedVersion: started.version,
    summary: 'Missing review.', checks: [checks[0]]
  }), /code-review/);
  await assert.rejects(microRun({
    action: 'submit', project: root, changeId: 'micro-limits', expectedVersion: started.version,
    summary: 'Too large.', checks
  }), /Changed lines/);
  await assert.rejects(microRun({
    action: 'start', project: root, changeId: 'micro-bad-limits', title: 'Bad limits',
    files: ['README.md'], limits: {maxFiles: 0}
  }), /limits\.maxFiles/);
  await assert.rejects(microRun({
    action: 'start', project: root, changeId: 'micro-bad-limits', title: 'Bad limits',
    files: ['README.md'], limits: {maxFiles: 2, surprise: 1}
  }), /unknown fields/);
});

test('micro acceptance rejection preserves evidence and returns to implementation', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  const started = await microRun({
    action: 'start', project: root, changeId: 'micro-reject', title: 'Docs wording', files: ['README.md']
  });
  await writeFile(path.join(root, 'README.md'), '# Fixture\n\nRevised wording.\n');
  const submitted = await microRun({
    action: 'submit', project: root, changeId: 'micro-reject', expectedVersion: started.version,
    summary: 'Revised the fixture wording.', checks
  });
  const rejected = await microRun({
    action: 'accept', project: root, changeId: 'micro-reject', expectedVersion: submitted.version,
    reviewHash: submitted.pendingReview.hash, decision: 'reject', feedback: 'Adjust the wording once more.'
  });
  assert.equal(rejected.stage, 'implementation');
  assert.equal(rejected.status, 'in-progress');
  assert.equal(rejected.pendingReview, null);
  assert.deepEqual(rejected.evidence, submitted.evidence);
  const resubmitted = await microRun({
    action: 'submit', project: root, changeId: 'micro-reject', expectedVersion: rejected.version,
    summary: 'Resubmitted after feedback.', checks
  });
  const accepted = await microRun({
    action: 'accept', project: root, changeId: 'micro-reject', expectedVersion: resubmitted.version,
    reviewHash: resubmitted.pendingReview.hash, decision: 'accept-no-record'
  });
  assert.equal(accepted.status, 'completed');
  assert.equal(accepted.acceptance.recorded, false);
});

test('micro acceptance rejects changes made after submission', async t => {
  const root = await project();
  t.after(() => rm(root, { recursive: true, force: true }));
  const started = await microRun({
    action: 'start', project: root, changeId: 'micro-concurrent', title: 'Bound docs', files: ['README.md']
  });
  await writeFile(path.join(root, 'README.md'), '# Fixture\n\nSubmitted wording.\n');
  const submitted = await microRun({
    action: 'submit', project: root, changeId: 'micro-concurrent', expectedVersion: started.version,
    summary: 'Submitted the documentation wording.', checks
  });
  assert.equal(submitted.evidence.sourceFingerprint.length, 64);
  await writeFile(path.join(root, 'README.md'), '# Fixture\n\nConcurrent wording.\n');
  await assert.rejects(microRun({
    action: 'accept', project: root, changeId: 'micro-concurrent', expectedVersion: submitted.version,
    reviewHash: submitted.pendingReview.hash, decision: 'accept-no-record'
  }), /Source changed after micro submission/);
  assert.equal((await microRun({ action: 'state', project: root, changeId: 'micro-concurrent' })).status, 'awaiting-approval');
});

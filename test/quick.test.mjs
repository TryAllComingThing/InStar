import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {run as quickRun} from '../runtime/quick-controller/index.mjs';

async function project() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'instar-quick-')));
  await mkdir(path.join(root, 'src'), {recursive: true});
  await writeFile(path.join(root, '.instar.json'), JSON.stringify({schemaVersion: 1}, null, 2) + '\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({scripts: {}}, null, 2) + '\n');
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 1;\n');
  return root;
}

const brief = '# Change brief\n\nOutcome: return two for the local helper.\n';

test('quick path uses one brief and two explicit human decisions', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  const started = await quickRun({
    action: 'start', project: root, changeId: 'quick-add-two', title: 'Add two', stack: 'backend',
    brief, files: ['src/app.js']
  });
  assert.equal(started.path, 'quick');
  assert.equal(started.pendingApproval, 'brief');
  assert.equal(await readFile(path.join(root, 'planning/quick/quick-add-two/change-brief.md'), 'utf8'), brief);
  await assert.rejects(quickRun({
    action: 'approve', project: root, changeId: 'quick-add-two', expectedVersion: 0,
    reviewHash: 'wrong', decision: 'accept-record', confirmation: 'approved'
  }), /reviewHash/);
  const approved = await quickRun({
    action: 'approve', project: root, changeId: 'quick-add-two', expectedVersion: 0,
    reviewHash: started.pendingReview.hash, decision: 'accept-record', confirmation: 'approved in test'
  });
  assert.equal(approved.stage, 'implementation');
  assert.equal(approved.approvals.brief.decision, 'accept-record');
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 2;\n');
  const submitted = await quickRun({
    action: 'submit', project: root, changeId: 'quick-add-two', expectedVersion: approved.version,
    summary: 'Changed the helper to return two.', checks: [
      {name: 'test', status: 'passed', evidence: 'node --test'},
      {name: 'code-review', status: 'passed', evidence: 'reviewed src/app.js'}
    ]
  });
  assert.equal(submitted.stage, 'acceptance');
  assert.deepEqual(submitted.evidence.files, ['src/app.js']);
  const accepted = await quickRun({
    action: 'accept', project: root, changeId: 'quick-add-two', expectedVersion: submitted.version,
    reviewHash: submitted.pendingReview.hash, decision: 'accept-no-record'
  });
  assert.equal(accepted.status, 'completed');
  assert.equal(accepted.approvals.acceptance.recorded, false);
});

test('quick path rejects declared and observed governed changes', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  await assert.rejects(quickRun({
    action: 'start', project: root, changeId: 'quick-ui', title: 'Change UI', stack: 'frontend',
    brief, files: ['src/views/Login.vue']
  }), /UI changes|governed impact/);
  const started = await quickRun({
    action: 'start', project: root, changeId: 'quick-escape', title: 'Local helper', stack: 'backend',
    brief, files: ['src/app.js']
  });
  const approved = await quickRun({
    action: 'approve', project: root, changeId: 'quick-escape', expectedVersion: started.version,
    reviewHash: started.pendingReview.hash, decision: 'accept-record', confirmation: 'approved'
  });
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 2;\n');
  await mkdir(path.join(root, 'src/auth'), {recursive: true});
  await writeFile(path.join(root, 'src/auth/login.js'), 'export const login = () => true;\n');
  await assert.rejects(quickRun({
    action: 'submit', project: root, changeId: 'quick-escape', expectedVersion: approved.version,
    summary: 'Sneaked in authentication.', checks: [{name: 'code-review', status: 'passed'}]
  }), /governed impact/);
});

test('quick path observes a workspace baseline and fails closed when it is missing', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(path.join(root, '.instarignore'), 'ignored-cache/\n');
  const started = await quickRun({
    action: 'start', project: root, changeId: 'quick-baseline', title: 'Baseline path', stack: 'backend',
    brief, files: ['src/app.js']
  });
  const approved = await quickRun({
    action: 'approve', project: root, changeId: 'quick-baseline', expectedVersion: started.version,
    reviewHash: started.pendingReview.hash, decision: 'accept-record', confirmation: 'approved'
  });
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 2;\n');
  await mkdir(path.join(root, 'ignored-cache'), {recursive: true});
  await writeFile(path.join(root, 'ignored-cache/generated.js'), 'generated');
  const classified = await quickRun({action: 'classify', project: root, changeId: 'quick-baseline'});
  assert.equal(classified.mode, 'baseline');
  assert.deepEqual(classified.paths, ['src/app.js']);
  await rm(path.join(root, '.instar/baselines/quick-baseline.json'));
  await assert.rejects(quickRun({
    action: 'submit', project: root, changeId: 'quick-baseline', expectedVersion: approved.version,
    summary: 'Baseline disappeared.', checks: [{name: 'code-review', status: 'passed'}]
  }), /baseline/i);
});

test('quick path rejects failed checks, missing review and oversized diffs', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  const started = await quickRun({
    action: 'start', project: root, changeId: 'quick-checks', title: 'Checks', stack: 'backend',
    brief, files: ['src/app.js'], limits: {maxFiles: 10, maxChangedLines: 2}
  });
  const approved = await quickRun({
    action: 'approve', project: root, changeId: 'quick-checks', expectedVersion: started.version,
    reviewHash: started.pendingReview.hash, decision: 'accept-record', confirmation: 'approved'
  });
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 2;\nexport const other = 3;\n');
  await assert.rejects(quickRun({
    action: 'submit', project: root, changeId: 'quick-checks', expectedVersion: approved.version,
    summary: 'Too large.', checks: [{name: 'test', status: 'passed'}]
  }), /code-review/);
  await assert.rejects(quickRun({
    action: 'submit', project: root, changeId: 'quick-checks', expectedVersion: approved.version,
    summary: 'Too large.', checks: [
      {name: 'test', status: 'passed'},
      {name: 'code-review', status: 'passed'}
    ]
  }), /Changed lines/);
});

test('quick path rejects invalid limits and supports revising a rejected brief', async t => {
  const root = await project();
  t.after(() => rm(root, {recursive: true, force: true}));
  await assert.rejects(quickRun({
    action: 'start', project: root, changeId: 'quick-bad-limits', title: 'Bad limits', stack: 'backend',
    brief, files: ['src/app.js'], limits: {maxFiles: 0}
  }), /limits\.maxFiles/);
  await assert.rejects(quickRun({
    action: 'start', project: root, changeId: 'quick-bad-limits', title: 'Bad limits', stack: 'backend',
    brief, files: ['src/app.js'], limits: {maxChangedLines: 10, surprise: 1}
  }), /unknown fields/);

  const started = await quickRun({
    action: 'start', project: root, changeId: 'quick-revise', title: 'Revise brief', stack: 'backend',
    brief, files: ['src/app.js']
  });
  const rejected = await quickRun({
    action: 'approve', project: root, changeId: 'quick-revise', expectedVersion: started.version,
    reviewHash: started.pendingReview.hash, decision: 'reject', feedback: 'Clarify the acceptance check.'
  });
  assert.equal(rejected.status, 'in-progress');
  const revisedBrief = `${brief}\nAcceptance: node --test test/quick.test.mjs passes.\n`;
  const revised = await quickRun({
    action: 'revise-brief', project: root, changeId: 'quick-revise', expectedVersion: rejected.version,
    brief: revisedBrief
  });
  assert.equal(revised.status, 'awaiting-approval');
  assert.equal(revised.pendingReview.kind, 'brief');
  assert.notEqual(revised.pendingReview.hash, started.pendingReview.hash);
  assert.equal(await readFile(path.join(root, 'planning/quick/quick-revise/change-brief.md'), 'utf8'), `${revisedBrief.trim()}\n`);
  const approved = await quickRun({
    action: 'approve', project: root, changeId: 'quick-revise', expectedVersion: revised.version,
    reviewHash: revised.pendingReview.hash, decision: 'accept-record', confirmation: 'approved after revision'
  });
  assert.equal(approved.stage, 'implementation');
});

test('quick path rejects replaced baselines and changes after submission', async t => {
  const root = await project();
  t.after(() => rm(root, { recursive: true, force: true }));
  const started = await quickRun({
    action: 'start', project: root, changeId: 'quick-tamper', title: 'Bind evidence', stack: 'backend',
    brief, files: ['src/app.js']
  });
  assert.equal(started.baseline.fingerprint.length, 64);
  const baselineFile = path.join(root, '.instar/baselines/quick-tamper.json');
  const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
  await writeFile(baselineFile, JSON.stringify({ ...baseline, fingerprint: '0'.repeat(64) }));
  await assert.rejects(quickRun({
    action: 'classify', project: root, changeId: 'quick-tamper'
  }), /baseline.*hash mismatch/i);
  await writeFile(baselineFile, JSON.stringify(baseline));

  const approved = await quickRun({
    action: 'approve', project: root, changeId: 'quick-tamper', expectedVersion: started.version,
    reviewHash: started.pendingReview.hash, decision: 'accept-record', confirmation: 'approved'
  });
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 2;\n');
  const submitted = await quickRun({
    action: 'submit', project: root, changeId: 'quick-tamper', expectedVersion: approved.version,
    summary: 'Submitted once.', checks: [{ name: 'code-review', status: 'passed' }]
  });
  assert.equal(submitted.evidence.sourceFingerprint.length, 64);
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 3;\n');
  await assert.rejects(quickRun({
    action: 'accept', project: root, changeId: 'quick-tamper', expectedVersion: submitted.version,
    reviewHash: submitted.pendingReview.hash, decision: 'accept-no-record'
  }), /Source changed after quick submission/);
});

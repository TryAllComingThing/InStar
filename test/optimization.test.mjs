import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {run} from '../runtime/workflow-controller/index.mjs';
import {approvalHash, legacyApprovalHash, assertApprovals} from '../runtime/workflow-controller/documents.mjs';
import {inspectEvidenceFreshness} from '../runtime/workflow-controller/evidence.mjs';
import {validateUiArtifact} from '../runtime/shared/ui-evidence.mjs';
import {validatePreviewRuntime, startPreviewRuntime} from '../runtime/shared/preview-runtime.mjs';

const changeId = 'oa-test';

async function tempProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'instar-opt-'));
  await writeFile(path.join(root, '.instar.json'), JSON.stringify({schemaVersion: 1}, null, 2) + '\n');
  await mkdir(path.join(root, 'planning/changes', changeId, 'specs/auth'), {recursive: true});
  await mkdir(path.join(root, 'planning/specs'), {recursive: true});
  await mkdir(path.join(root, 'planning/workflows'), {recursive: true});
  await mkdir(path.join(root, 'docs/prd'), {recursive: true});
  await mkdir(path.join(root, 'src'), {recursive: true});
  await writeFile(path.join(root, 'docs/prd', `${changeId}.md`), '# PRD\nApproved outcome.\n');
  await writeFile(path.join(root, 'planning/changes', changeId, 'proposal.md'), '## Why\nApproved outcome.\n');
  await writeFile(path.join(root, 'planning/changes', changeId, 'specs/auth/spec.md'), '## Requirements\nApproved auth behavior.\n');
  await writeFile(path.join(root, 'planning/changes', changeId, 'technical-design.md'), '# Technical design\nUse the existing auth boundary.\n');
  await writeFile(path.join(root, 'planning/changes', changeId, 'tasks.md'), '- [ ] 1.1 Implement login\n- [ ] 1.2 Implement workbench\n');
  await writeFile(path.join(root, 'src/login.js'), 'export const login = true;\n');
  await writeFile(path.join(root, 'src/workbench.js'), 'export const workbench = true;\n');
  return root;
}

async function writeState(root, state) {
  await writeFile(path.join(root, 'planning/workflows', `${state.changeId}.json`), JSON.stringify(state, null, 2) + '\n');
  const usagePath = path.join(root, 'reports/usage', `${state.changeId}.json`);
  await mkdir(path.dirname(usagePath), {recursive: true});
  await writeFile(usagePath, JSON.stringify({
    schemaVersion: 2,
    changeId: state.changeId,
    records: [],
    totals: {inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0, billableTokens: 0},
    apiCalls: 0,
    budget: {...state.usageBudget, status: 'within', enforced: state.usageBudget?.enforce === true}
  }, null, 2) + '\n');
}

async function readState(root) {
  return JSON.parse(await readFile(path.join(root, 'planning/workflows', `${changeId}.json`), 'utf8'));
}

function baseState(extra = {}) {
  return {
    schemaVersion: 6,
    changeId,
    prdPath: `docs/prd/${changeId}.md`,
    stage: 'implementation',
    status: 'in-progress',
    pendingApproval: null,
    pendingReview: null,
    approvals: {},
    taskEvidence: {},
    clarifications: [],
    version: 0,
    history: [],
    ui: false,
    stack: 'backend',
    designCheck: null,
    usageBudget: {maxBillableTokens: 6_000_000, maxApiCalls: 1200, enforce: true},
    reviewerPolicy: {allowMainAgentFallback: false, maxRoundsPerRoleStage: 3},
    evidencePolicy: {mode: 'manual'},
    designConstraintsHash: 'constraints-v1',
    designStandardsHash: 'standards-v1',
    designInStarReferencesHash: 'references-v1',
    ...extra
  };
}

async function approveDocuments(root, state) {
  for (const kind of ['prd', 'spec', 'design', 'tasks']) {
    state.approvals[kind] = {
      hash: await approvalHash(root, state, kind),
      binding: 'document-v6',
      decision: 'accept-record',
      recorded: true,
      at: new Date().toISOString()
    };
  }
  return state;
}

test('schema 6 keeps document approvals stable when source files change', async () => {
  const root = await tempProject();
  try {
    const state = baseState();
    await approveDocuments(root, state);
    const before = await approvalHash(root, state, 'tasks');
    await writeFile(path.join(root, 'src/new-source-file.js'), 'export const added = true;\n');
    const after = await approvalHash(root, state, 'tasks');
    assert.equal(after, before);
    await assertApprovals(root, state, {spec: true, design: true, tasks: true});
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('complete-tasks validates the full batch before one atomic task update', async () => {
  const root = await tempProject();
  try {
    await writeFile(path.join(root, 'planning/changes', changeId, 'tasks.md'), [
      '# Tasks',
      '',
      '- [ ] 1.1 Implement login',
      '- [ ] 1.2 Implement workbench',
      ''
    ].join('\n'));
    const state = await approveDocuments(root, baseState());
    state.version = 7;
    await writeState(root, state);

    const result = await run({
      action: 'complete-tasks', project: root, changeId, expectedVersion: 7,
      tasks: [
        {taskId: '1.1', evidence: {summary: 'Login implemented', files: [{path: 'src/login.js', line: 1}]}},
        {taskId: '1.2', evidence: {summary: 'Workbench implemented', files: [{path: 'src/workbench.js', line: 1}]}}
      ]
    });
    assert.equal(result.version, 8);
    assert.deepEqual(Object.keys(result.taskEvidence).sort(), ['1.1', '1.2']);
    assert.equal(result.history.filter(item => item.action === 'complete-tasks').length, 1);
    const tasks = await readFile(path.join(root, 'planning/changes', changeId, 'tasks.md'), 'utf8');
    assert.match(tasks, /- \[x\] 1\.1/);
    assert.match(tasks, /- \[x\] 1\.2/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('complete-tasks is all-or-nothing when any evidence is invalid', async () => {
  const root = await tempProject();
  try {
    const state = await approveDocuments(root, baseState());
    await writeState(root, state);
    const tasksPath = path.join(root, 'planning/changes', changeId, 'tasks.md');
    await writeFile(tasksPath, '- [ ] 1.1 Implement login\n- [ ] 1.2 Implement workbench\n');
    await assert.rejects(run({
      action: 'complete-tasks', project: root, changeId, expectedVersion: 0,
      tasks: [
        {taskId: '1.1', evidence: {summary: 'Login implemented', files: [{path: 'src/login.js'}]}},
        {taskId: '1.2', evidence: {summary: 'Missing file', files: [{path: 'src/missing.js'}]}}
      ]
    }), /ENOENT/);
    assert.equal(await readFile(tasksPath, 'utf8'), '- [ ] 1.1 Implement login\n- [ ] 1.2 Implement workbench\n');
    const stored = await readState(root);
    assert.deepEqual(stored.taskEvidence, {});
    assert.equal(stored.version, 0);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('refresh-evidence invalidates implementation evidence without reopening tasks', async () => {
  const root = await tempProject();
  try {
    const state = await approveDocuments(root, baseState({
      stage: 'verification',
      implementationReview: {sourceHash: 'old'},
      verification: {sourceHash: 'old'},
      taskEvidence: {'1.1': {evidence: {summary: 'kept'}, at: new Date().toISOString()}}
    }));
    state.approvals.implementation = {hash: 'old', binding: 'document-v6', decision: 'accept-record', recorded: true, at: new Date().toISOString()};
    state.approvals.acceptance = {hash: 'old', binding: 'document-v6', decision: 'accept-record', recorded: true, at: new Date().toISOString()};
    await writeState(root, state);
    const result = await run({action: 'refresh-evidence', project: root, changeId, expectedVersion: 0, reason: 'Source-only implementation change'});
    assert.equal(result.stage, 'implementation');
    assert.equal(result.status, 'in-progress');
    assert.equal(result.implementationReview, undefined);
    assert.equal(result.verification, undefined);
    assert.equal(result.approvals.implementation, undefined);
    assert.equal(result.approvals.acceptance, undefined);
    assert.deepEqual(Object.keys(result.taskEvidence), ['1.1']);
    assert.deepEqual(result.evidenceRefresh.preserved, ['prd', 'spec', 'design', 'tasks']);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('stale evidence is reported without mutating state', async () => {
  const root = await tempProject();
  try {
    const freshness = await inspectEvidenceFreshness(root, baseState({
      implementationReview: {sourceHash: 'outdated', checks: [], evidence: {mode: 'manual'}}
    }));
    assert.equal(freshness.implementation.status, 'stale');
    assert.match(freshness.implementation.reasons.join(' '), /different source snapshot/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('start applies an enforced default usage budget and blocks on overage', async () => {
  const root = await tempProject();
  try {
    const started = await run({action: 'start', project: root, changeId: 'budget-test', document: '# PRD\n', ui: false, stack: 'backend'});
    assert.equal(started.usageBudget.maxBillableTokens, 6_000_000);
    assert.equal(started.usageBudget.enforce, true);
    await mkdir(path.join(root, 'reports/usage'), {recursive: true});
    await writeFile(path.join(root, 'reports/usage/budget-test.json'), JSON.stringify({
      schemaVersion: 1,
      changeId: 'budget-test',
      records: [],
      totals: {inputTokens: 6_000_001, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 6_000_001, billableTokens: 6_000_001},
      apiCalls: 1,
      budget: {...started.usageBudget, status: 'exceeded', enforced: true}
    }) + '\n');
    await assert.rejects(run({
      action: 'submit-prd', project: root, changeId: 'budget-test', expectedVersion: started.version
    }), /Usage budget exceeded/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('schema 5 migration preserves unchanged document approvals', async () => {
  const root = await tempProject();
  try {
    const state = baseState({schemaVersion: 5, stage: 'spec'});
    for (const kind of ['prd', 'spec']) {
      state.approvals[kind] = {hash: await legacyApprovalHash(root, state, kind), decision: 'accept-record', recorded: true, at: new Date().toISOString()};
    }
    await writeState(root, state);
    const result = await run({action: 'migrate', project: root, changeId, expectedVersion: 0, reason: 'Adopt schema 6', ui: false, stack: 'backend'});
    assert.equal(result.schemaVersion, 6);
    assert.equal(result.stage, 'spec');
    assert.deepEqual(result.migration.preservedApprovals.sort(), ['prd', 'spec']);
    assert.equal(result.approvals.prd.binding, 'legacy-v5-frozen');
    await assertApprovals(root, result, {spec: true});
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('UI artifacts enforce headless semantic contracts', () => {
  const browser = {kind: 'browser', status: 'PASS', tool: 'playwright', headless: true, generatedAt: new Date().toISOString(), browserMatrix: ['chromium-desktop'], journeys: [{route: '/login', status: 'PASS'}]};
  assert.equal(validateUiArtifact(JSON.stringify(browser), 'browser').status, 'PASS');
  assert.equal(validateUiArtifact(JSON.stringify(browser), 'browser', 'artifact', {routes: ['/login'], browserMatrix: ['chromium-desktop']}).status, 'PASS');
  assert.throws(() => validateUiArtifact(JSON.stringify(browser), 'browser', 'artifact', {routes: ['/dashboard']}), /configured routes/);
  assert.throws(() => validateUiArtifact(JSON.stringify(browser), 'browser', 'artifact', {browserMatrix: ['firefox-desktop']}), /configured browserMatrix/);
  assert.throws(() => validateUiArtifact(JSON.stringify({...browser, headless: false}), 'browser'), /headless/);

  const accessibility = {
    kind: 'accessibility', status: 'PASS', tool: 'playwright-axe', headless: true, generatedAt: new Date().toISOString(),
    browserMatrix: ['chromium-desktop'],
    routesScanned: 1, violations: [], incomplete: [], results: [{route: '/login', status: 'PASS', violations: [], incomplete: []}]
  };
  assert.equal(validateUiArtifact(JSON.stringify(accessibility), 'accessibility').status, 'PASS');
  assert.equal(validateUiArtifact(JSON.stringify(accessibility), 'accessibility', 'artifact', {routes: ['/login'], browserMatrix: ['chromium-desktop']}).status, 'PASS');
  assert.throws(() => validateUiArtifact(JSON.stringify(accessibility), 'accessibility', 'artifact', {routes: ['/settings']}), /configured routes/);
  assert.throws(() => validateUiArtifact(JSON.stringify({...accessibility, incomplete: [{id: 'color-contrast'}]}), 'accessibility'), /incomplete/);
  assert.throws(() => validateUiArtifact(JSON.stringify({...accessibility, results: [{...accessibility.results[0], status: 'FAIL'}]}), 'accessibility'), /status PASS/);

  const keyboard = {
    kind: 'keyboard', status: 'PASS', tool: 'playwright', headless: true, generatedAt: new Date().toISOString(),
    browserMatrix: ['chromium-desktop'],
    journeys: [{route: '/login', status: 'PASS', steps: ['Tab'], expectedFocus: '#login-title', actualFocus: '#login-title'}]
  };
  assert.equal(validateUiArtifact(JSON.stringify(keyboard), 'keyboard').status, 'PASS');
  assert.equal(validateUiArtifact(JSON.stringify(keyboard), 'keyboard', 'artifact', {routes: ['/login'], browserMatrix: ['chromium-desktop']}).status, 'PASS');
  assert.throws(() => validateUiArtifact(JSON.stringify(keyboard), 'keyboard', 'artifact', {routes: ['/workbench']}), /configured routes/);
  assert.throws(() => validateUiArtifact(JSON.stringify({...keyboard, journeys: [{...keyboard.journeys[0], actualFocus: 'body'}]}), 'keyboard'), /actualFocus/);
});

test('preview runtime uses one random loopback port and stops cleanly', async () => {
  const root = await tempProject();
  try {
    const script = path.join(root, 'preview.mjs');
    await writeFile(script, "import http from 'node:http';const port=Number(process.env.PORT);http.createServer((_q,r)=>r.end('ok')).listen(port,'127.0.0.1');\n");
    const runtime = validatePreviewRuntime({command: process.execPath, args: [script], timeoutMs: 5000});
    const preview = await startPreviewRuntime(root, runtime, process.env);
    try {
      const response = await fetch(preview.baseUrl);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'ok');
      assert.ok(preview.port > 0);
    } finally {
      assert.equal(await preview.stop(), true);
      await assert.rejects(async()=>process.kill(preview.pid,0),error=>error.code==='ESRCH');
    }
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('review rounds stop after the configured limit for the same source target', async () => {
  const root = await tempProject();
  try {
    await writeState(root, baseState());
    for (let index = 0; index < 3; index += 1) {
      const invocationId = `review-${index}`;
      await run({
        action: 'trace-agent', project: root, changeId, role: 'architect', event: 'started',
        executionMode: 'main-agent-fallback', fallbackReason: 'test fallback', invocationId,
        summary: `Review round ${index}`, stage: 'implementation'
      });
      await run({
        action: 'trace-agent', project: root, changeId, role: 'architect', event: 'completed',
        executionMode: 'main-agent-fallback', fallbackReason: 'test fallback', invocationId,
        summary: `Review round ${index}`, stage: 'implementation', reviewedFiles: ['src/login.js'],
        findings: [{severity: 'suggestion', message: `Suggestion ${index}`}], unverified: []
      });
    }
    await run({
      action: 'trace-agent', project: root, changeId, role: 'architect', event: 'started',
      executionMode: 'main-agent-fallback', fallbackReason: 'test fallback', invocationId: 'review-4',
      summary: 'Fourth review', stage: 'implementation'
    });
    await assert.rejects(run({
      action: 'trace-agent', project: root, changeId, role: 'architect', event: 'completed',
      executionMode: 'main-agent-fallback', fallbackReason: 'test fallback', invocationId: 'review-4',
      summary: 'Fourth review', stage: 'implementation', reviewedFiles: ['src/login.js'],
      findings: [{severity: 'suggestion', message: 'Another suggestion'}], unverified: []
    }), /review round limit/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

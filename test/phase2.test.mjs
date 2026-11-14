import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {run as workflowRun} from '../runtime/workflow-controller/index.mjs';
import {collectVerificationEvidence} from '../runtime/workflow-controller/evidence.mjs';
import {run as qualityRun} from '../runtime/quality-controller/index.mjs';
import {requiredWorkflowKinds} from '../runtime/shared/profile-contract.mjs';
import {classifyRisk, deriveObservedImpact} from '../runtime/shared/risk-policy.mjs';
import {assertFrozenFullProfile, validateVerificationLayers} from '../runtime/shared/verification-layers.mjs';
import {parseFriendlyArgs} from '../runtime/quality-controller/friendly-cli.mjs';

async function projectFixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'instar-phase2-')));
  await mkdir(path.join(root, 'src'), {recursive: true});
  await mkdir(path.join(root, 'planning/workflows'), {recursive: true});
  await mkdir(path.join(root, 'planning/changes'), {recursive: true});
  await mkdir(path.join(root, 'docs/prd'), {recursive: true});
  await writeFile(path.join(root, '.instar.json'), JSON.stringify({schemaVersion: 1}, null, 2) + '\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({scripts: {}}, null, 2) + '\n');
  await writeFile(path.join(root, 'src/app.js'), 'export const value = 1;\n');
  return root;
}

async function qualityProject() {
  const root = await projectFixture();
  const counterDir = await realpath(await mkdtemp(path.join(os.tmpdir(), 'instar-phase2-count-')));
  const counter = path.join(counterDir, 'count');
  const script = path.join(root, 'check.mjs');
  await writeFile(script, [
    "import fs from 'node:fs';",
    "const [counter,mode,...files]=process.argv.slice(2);",
    "const count=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8')):0;",
    "fs.writeFileSync(counter,String(count+1));",
    "if(mode==='affected'&&!files.length)process.exit(2);",
    ''
  ].join('\n'));
  const check = (kind, label) => ({kind, command: process.execPath, args: [script, counter, label], toolVersion: 'fixture-1'});
  const config = {
    schemaVersion: 3,
    verification: {
      profiles: {
        commit: ['lint-check'],
        implementation: ['lint-check', 'format-check', 'test-check'],
        full: ['lint-check', 'format-check', 'test-check', 'build-check']
      },
      layers: {
        L1: ['affected-test'],
        L2: ['lint-check', 'format-check', 'test-check']
      },
      cache: {enabled: true, buildOutputs: []}
    },
    tools: {
      checks: {
        'affected-test': {...check('test', 'affected'), args: [script, counter, 'affected', '{files}']},
        'lint-check': check('lint', 'all'),
        'format-check': check('format', 'all'),
        'test-check': check('test', 'all'),
        'build-check': check('build', 'all')
      }
    }
  };
  await writeFile(path.join(root, '.instar-quality.json'), JSON.stringify(config, null, 2) + '\n');
  return {root, counter, counterDir, config};
}

async function count(file) {
  try { return Number(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
}

test('risk classification escalates high-impact and UI work', () => {
  const standard = classifyRisk({}, {ui: false});
  assert.equal(standard.tier, 'standard');
  assert.deepEqual(standard.layers, ['L1', 'L2', 'L3']);

  const governed = classifyRisk({tier: 'standard', impact: ['authentication']}, {ui: true});
  assert.equal(governed.tier, 'governed');
  assert.equal(governed.requireSecurityEvidence, true);
  assert.match(governed.reasons.join(' '), /authentication/);

  const ui = classifyRisk({tier: 'lean', impact: ['documentation']}, {ui: true});
  assert.equal(ui.tier, 'standard');
  assert.match(ui.reasons.join(' '), /UI changes cannot use lean/);
  const escalated = classifyRisk({tier: 'lean', impact: ['authentication']}, {ui: false});
  assert.equal(escalated.tier, 'governed');

  const lean = classifyRisk({tier: 'lean', impact: ['local']}, {ui: false});
  assert.deepEqual(lean.layers, ['L1', 'L3']);
});

test('workflow start defaults to standard and set-risk escalates high-impact work', async () => {
  const root = await projectFixture();
  try {
    const state = await workflowRun({
      action: 'start', project: root, changeId: 'phase2-risk', ui: false, stack: 'backend',
      document: '# Phase 2 risk\n'
    });
    assert.equal(state.risk.tier, 'standard');
    const updated = await workflowRun({
      action: 'set-risk', project: root, changeId: 'phase2-risk', expectedVersion: state.version,
      impact: ['authentication'], reason: 'Login boundary changes'
    });
    assert.equal(updated.risk.tier, 'governed');
    assert.equal(updated.risk.source, 'inferred');
    assert.equal(updated.risk.requireSecurityEvidence, true);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('friendly verify arguments map layers and cache controls', async () => {
  const l1 = await parseFriendlyArgs(['verify', '--layer', 'L1', '--files', 'src/a.ts,src/b.ts'], process.cwd());
  assert.equal(l1.profile, 'implementation');
  assert.equal(l1.layer, 'L1');
  assert.deepEqual(l1.files, ['src/a.ts', 'src/b.ts']);
  assert.equal(l1.cache, true);

  const l3 = await parseFriendlyArgs(['verify', '--layer', 'L3', '--no-cache'], process.cwd());
  assert.equal(l3.profile, 'full');
  assert.equal(l3.layer, 'L3');
  assert.equal(l3.cache, false);
});

test('layer configuration requires affected checks and complete cache identity', async () => {
  const root = await projectFixture();
  try {
    const config = {
      schemaVersion: 3,
      verification: {
        profiles: {commit: ['test-check'], implementation: ['test-check'], full: ['test-check']},
        layers: {L1: ['affected-test'], L2: ['test-check']}
      },
      tools: {checks: {
        'affected-test': {kind: 'test', command: process.execPath, args: ['check.mjs', '--files', '{files}']},
        'test-check': {kind: 'test', command: process.execPath, args: ['check.mjs']},
        'build-check': {kind: 'build', command: process.execPath, args: ['--version']}
      }}
    };
    config.verification.profiles.full = ['test-check', 'build-check'];
    assert.throws(() => validateVerificationLayers(config), /toolVersion/);
    config.tools.checks['affected-test'].toolVersion = '1.0.0';
    config.tools.checks['test-check'].toolVersion = '1.0.0';
    assert.doesNotThrow(() => validateVerificationLayers(config));
    delete config.tools.checks['affected-test'].args;
    config.tools.checks['affected-test'].args = ['check.mjs'];
    assert.throws(() => validateVerificationLayers(config), /placeholder \{files\}/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('layer-only checks cannot bypass command validation', async () => {
  const root = await projectFixture();
  try {
    const config = {
      schemaVersion: 3,
      verification: {
        profiles: {commit: ['test-check'], implementation: ['test-check'], full: ['test-check', 'build-check']},
        layers: {L1: ['unsafe-check'], L2: ['test-check']},
        cache: {enabled: true, buildOutputs: []}
      },
      tools: {checks: {
        'unsafe-check': {kind: 'test', command: '/tmp/not-allowed', args: ['{files}'], toolVersion: '1.0.0'},
        'test-check': {kind: 'test', command: process.execPath, args: ['check.mjs'], toolVersion: '1.0.0', incremental: true},
        'build-check': {kind: 'build', command: process.execPath, args: ['--version'], toolVersion: '1.0.0'}
      }}
    };
    await writeFile(path.join(root, '.instar-quality.json'), JSON.stringify(config, null, 2) + '\n');
    await assert.rejects(qualityRun({action: 'snapshot', project: root}), /Invalid tools\.checks\.unsafe-check/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('L1 caches by exact evidence key and invalidates when source changes', async () => {
  const {root, counter, counterDir} = await qualityProject();
  try {
    const first = await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation', layer: 'L1', files: ['src/app.js']});
    assert.equal(first.status, 'PASS', JSON.stringify(first));
    assert.equal(first.layer, 'L1');
    assert.equal(first.cache.enabled, true);
    assert.equal(first.checks[0].cacheHit, undefined);
    assert.equal(await count(counter), 1);

    const second = await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation', layer: 'L1', files: ['src/app.js']});
    assert.equal(second.status, 'PASS');
    assert.equal(second.cache.hits, 1);
    assert.equal(second.checks[0].cacheHit, true);
    assert.equal(await count(counter), 1);

    await writeFile(path.join(root, 'src/app.js'), 'export const value = 2;\n');
    const third = await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation', layer: 'L1', files: ['src/app.js']});
    assert.equal(third.status, 'PASS');
    assert.equal(third.cache.hits, 0);
    assert.equal(await count(counter), 2);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(counterDir, {recursive: true, force: true});
  }
});

test('L3 frozen full always reruns even when an intermediate cache exists', async () => {
  const {root, counter, counterDir} = await qualityProject();
  try {
    await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation', layer: 'L1', files: ['src/app.js']});
    const before = await count(counter);
    const first = await qualityRun({action: 'frontend-verify', project: root, profile: 'full', layer: 'L3'});
    assert.equal(first.status, 'PASS', JSON.stringify(first));
    assert.equal(first.cache.enabled, false);
    assert.equal(first.cache.scope, 'frozen-full');
    assert.equal(await count(counter), before + 4);
    assert.equal(first.checks.at(-1).id, 'build-check');

    const second = await qualityRun({action: 'frontend-verify', project: root, profile: 'full', layer: 'L3'});
    assert.equal(second.status, 'PASS');
    assert.equal(second.checks.every(item => !item.cacheHit), true);
    assert.equal(await count(counter), before + 8);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(counterDir, {recursive: true, force: true});
  }
});

test('legacy commit verification reports remain readable while new reports use preflight', async () => {
  const {root, counterDir} = await qualityProject();
  try {
    await qualityRun({action: 'engineering-verify', project: root, profile: 'commit'});
    const canonicalPath = path.join(root, 'reports/engineering-verify-preflight.json');
    const canonical = JSON.parse(await readFile(canonicalPath, 'utf8'));
    assert.equal(canonical.kind, 'engineering-verify-preflight');
    assert.equal(canonical.profile, 'preflight');

    const legacyPath = path.join(root, 'reports/engineering-verify-commit.json');
    const legacy = {...canonical, kind: 'engineering-verify-commit', profile: 'commit'};
    await writeFile(legacyPath, JSON.stringify(legacy));
    await rm(canonicalPath);
    const input = {checks: legacy.checks.map(check => ({
      checkId: check.id,
      reportId: legacy.id,
      kind: check.kind,
      outcome: 'passed',
      artifact: check.artifact
    }))};
    const evidence = await collectVerificationEvidence(root, {ui: false, stack: 'backend'}, input, [], 'preflight');
    assert.equal(evidence.reportPath, 'reports/engineering-verify-commit.json');
    assert.equal(evidence.reportId, legacy.id);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(counterDir, {recursive: true, force: true});
  }
});

test('L1 and L2 reports jointly satisfy implementation evidence and reject artifact tampering', async () => {
  const {root, counterDir} = await qualityProject();
  try {
    await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation', layer: 'L1', files: ['src/app.js']});
    await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation', layer: 'L2', files: ['src/app.js']});
    const state = {ui: false, stack: 'backend', risk: classifyRisk({tier: 'standard'})};
    const evidence = await collectVerificationEvidence(root, state, {}, requiredWorkflowKinds('implementation', false), 'implementation');
    assert.equal(evidence.mode, 'strict-layered');
    assert.deepEqual(evidence.reports.map(item => item.layer), ['L1', 'L2']);
    assert.deepEqual([...new Set(evidence.checks.map(item => item.kind))].sort(), ['format', 'lint', 'test']);

    await assert.rejects(
      collectVerificationEvidence(root, {...state, risk: classifyRisk({tier: 'governed'})}, {}, requiredWorkflowKinds('implementation', false), 'implementation'),
      /Governed risk requires security evidence/
    );

    await writeFile(path.join(root, evidence.checks[0].artifact), '{"status":"PASS","tampered":true}\n');
    await assert.rejects(
      collectVerificationEvidence(root, state, {}, requiredWorkflowKinds('implementation', false), 'implementation'),
      /artifact changed/
    );
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(counterDir, {recursive: true, force: true});
  }
});

test('lean risk approves from L1 without requiring an L2 report but still requires L3 later', async () => {
  const {root, counter, counterDir, config} = await qualityProject();
  try {
    const affected = (kind, id) => ({kind, command: process.execPath, args: [path.join(root, 'check.mjs'), counter, 'affected', '{files}'], toolVersion: 'fixture-1'});
    config.verification.layers = {L1: ['lint-affected', 'format-affected', 'test-affected'], L2: ['test-check']};
    Object.assign(config.tools.checks, {
      'lint-affected': affected('lint', 'lint-affected'),
      'format-affected': affected('format', 'format-affected'),
      'test-affected': affected('test', 'test-affected')
    });
    await writeFile(path.join(root, '.instar-quality.json'), JSON.stringify(config, null, 2) + '\n');
    await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation', layer: 'L1', files: ['src/app.js']});
    const state = {ui: false, stack: 'backend', risk: classifyRisk({tier: 'lean', impact: ['local']})};
    const evidence = await collectVerificationEvidence(root, state, {}, requiredWorkflowKinds('implementation', false), 'implementation');
    assert.equal(evidence.mode, 'strict-layered');
    assert.deepEqual(evidence.reports.map(item => item.layer), ['L1']);
    assert.deepEqual([...new Set(evidence.checks.map(item => item.kind))].sort(), ['format', 'lint', 'test']);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(counterDir, {recursive: true, force: true});
  }
});

test('failed L1 rerun replaces an earlier PASS with BLOCK evidence', async () => {
  const {root, counterDir} = await qualityProject();
  try {
    await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation', layer: 'L1', files: ['src/app.js']});
    const first = JSON.parse(await readFile(path.join(root, 'reports/engineering-verify-L1.json'), 'utf8'));
    assert.equal(first.status, 'PASS');
    await assert.rejects(
      qualityRun({action: 'engineering-verify', project: root, profile: 'implementation', layer: 'L1', files: ['../escape']}),
      /safe workspace-relative path/
    );
    const failed = JSON.parse(await readFile(path.join(root, 'reports/engineering-verify-L1.json'), 'utf8'));
    assert.equal(failed.status, 'BLOCK');
    assert.equal(failed.layer, 'L1');
    await assert.rejects(
      collectVerificationEvidence(root, {ui: false, stack: 'backend', risk: classifyRisk({tier: 'standard'})}, {}, requiredWorkflowKinds('implementation', false), 'implementation'),
      /L1 verification report must be stable and passing/
    );
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(counterDir, {recursive: true, force: true});
  }
});

test('risk input fails closed and observed source changes prevent lean', async () => {
  assert.throws(() => classifyRisk({impacts: ['authentication']}), /unknown fields/);
  assert.throws(() => classifyRisk({tier: 'standard', unknown: true}), /unknown fields/);
  const observed = deriveObservedImpact(['src/auth/login.ts', 'migrations/001.sql', 'docs/README.md']);
  assert.equal(observed.codeChanged, true);
  assert.deepEqual([...new Set(observed.impact)].sort(), ['authentication', 'data', 'data-migration', 'documentation']);

  const escalated = classifyRisk(
    {tier: 'lean', impact: ['documentation']},
    {observedImpact: observed.impact, observedPaths: ['src/auth/login.ts']}
  );
  assert.equal(escalated.tier, 'governed');
  assert.match(escalated.reasons.join(' '), /authentication/);

  const standard = classifyRisk({tier: 'lean', impact: ['documentation']}, {observedPaths: ['src/widget.ts']});
  assert.equal(standard.tier, 'standard');
  assert.match(standard.reasons.join(' '), /non-documentation/);

  const root = await projectFixture();
  try {
    await assert.rejects(workflowRun({
      action: 'start', project: root, changeId: 'risk-invalid', ui: false, stack: 'backend',
      document: '# Invalid risk\n', risk: {impacts: ['authentication']}
    }), /unknown fields/);
    const state = await workflowRun({
      action: 'start', project: root, changeId: 'risk-valid', ui: false, stack: 'backend',
      document: '# Valid risk\n'
    });
    await assert.rejects(workflowRun({
      action: 'set-risk', project: root, changeId: state.changeId, expectedVersion: state.version,
      reason: 'Authentication boundary changes', risk: {impacts: ['authentication']}
    }), /unknown fields/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test('L3 requires a build before browser and accessibility checks', () => {
  const config = (full) => ({
    verification: {profiles: {full}},
    tools: {checks: {
      'build-check': {kind: 'build'},
      'browser-check': {kind: 'browser',routes:['/'],browserMatrix:['chromium-desktop']},
      'a11y-check': {kind: 'accessibility',routes:['/'],browserMatrix:['chromium-desktop']}
    }}
  });
  assert.throws(() => assertFrozenFullProfile(config(['browser-check'])), /requires a build check/);
  assert.throws(() => assertFrozenFullProfile(config(['browser-check', 'build-check'])), /build before/);
  assert.throws(() => assertFrozenFullProfile(config(['a11y-check', 'build-check'])), /build before/);
  assert.doesNotThrow(() => assertFrozenFullProfile(config(['build-check', 'browser-check'])));
});

test('configured UI routes and browser matrix are enforced through the quality controller', async () => {
  const root = await projectFixture();
  try {
    const script = path.join(root, 'ui-check.mjs');
    await writeFile(script, [
      "import fs from 'node:fs';",
      "fs.mkdirSync('reports',{recursive:true});",
      "fs.writeFileSync('reports/ui.json',JSON.stringify({kind:'browser',status:'PASS',tool:'playwright',headless:true,reportId:process.env.INSTAR_REPORT_ID,checkId:process.env.INSTAR_CHECK_ID,profile:process.env.INSTAR_PROFILE,snapshotFingerprint:process.env.INSTAR_SNAPSHOT_FINGERPRINT,generatedAt:new Date().toISOString(),browserMatrix:['chromium-desktop'],journeys:[{route:'/elsewhere',status:'PASS'}]}));",
      ''
    ].join('\n'));
    const config = {
      schemaVersion: 3,
      verification: {
        profiles: {commit: ['test-check'], implementation: ['browser-check'], full: ['build-check']}
      },
      tools: {checks: {
        'test-check': {kind: 'test', command: process.execPath, args: [script]},
        'browser-check': {kind: 'browser', command: process.execPath, args: [script], artifact: 'reports/ui.json', routes: ['/login'], browserMatrix: ['chromium-desktop']},
        'build-check': {kind: 'build', command: process.execPath, args: ['--version']}
      }}
    };
    await writeFile(path.join(root, '.instar-quality.json'), JSON.stringify(config, null, 2) + '\n');
    const result = await qualityRun({action: 'frontend-verify', project: root, profile: 'implementation'});
    assert.equal(result.status, 'BLOCK');
    assert.match(result.checks[0].reason, /configured routes/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

import path from 'node:path';
import {
  atomic, baselineReference, captureChangeBaseline, exists, hash, identifier, json, lock, now, observeChangedSourcePaths,
  projectRoot, putJson, requireText, safe
} from '../workflow-controller/files.mjs';
import {deriveObservedImpact} from '../shared/risk-policy.mjs';

const GOVERNED_IMPACTS = new Set([
  'authentication', 'authorization', 'security', 'secrets', 'data', 'data-migration',
  'api-contract', 'architecture', 'dependencies', 'infrastructure', 'ui'
]);
const DEFAULT_LIMITS = Object.freeze({maxFiles: 10, maxChangedLines: 400});
const DECISIONS = new Set(['accept-record', 'accept-no-record', 'reject']);
const LIMIT_KEYS = new Set(['maxFiles', 'maxChangedLines']);

const statePath = id => `.workflow/quick/${identifier(id)}.json`;
const briefPath = id => `planning/quick/${identifier(id)}/change-brief.md`;
const workflowPath = id => `planning/workflows/${identifier(id)}.json`;

function normalizeFiles(value, label = 'files', {required = false} = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && !value.length) || value.length > 500) {
    throw Error(`${label} must be an array with 1-500 paths`);
  }
  return [...new Set(value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim() || path.isAbsolute(item) || item.includes('\0') || item.split(/[\\/]/).includes('..')) {
      throw Error(`${label}[${index}] must be a safe workspace-relative path`);
    }
    return item.replaceAll('\\', '/').trim();
  }))];
}

function normalizeChecks(value) {
  if (!Array.isArray(value) || !value.length || value.length > 50) throw Error('checks must contain 1-50 items');
  return value.map((check, index) => {
    if (!check || typeof check !== 'object' || Array.isArray(check)) throw Error(`checks[${index}] must be an object`);
    requireText(check.name, `checks[${index}].name`);
    if (!['passed', 'failed', 'not-run'].includes(check.status)) throw Error(`checks[${index}].status must be passed, failed or not-run`);
    if (Buffer.byteLength(check.name.trim(), 'utf8') > 256) throw Error(`checks[${index}].name exceeds 256 bytes`);
    if (check.evidence !== undefined) requireText(check.evidence, `checks[${index}].evidence`);
    if (check.evidence !== undefined && Buffer.byteLength(check.evidence, 'utf8') > 16 * 1024) throw Error(`checks[${index}].evidence exceeds 16 KiB`);
    return {name: check.name.trim(), status: check.status, ...(check.evidence ? {evidence: check.evidence} : {})};
  });
}

function normalizeLimits(value, defaults = DEFAULT_LIMITS) {
  if (value === undefined) return {...defaults};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('limits must be an object');
  const unknown = Object.keys(value).filter(key => !LIMIT_KEYS.has(key));
  if (unknown.length) throw Error(`limits contains unknown fields: ${unknown.join(', ')}`);
  const limits = {...defaults};
  for (const key of LIMIT_KEYS) {
    if (value[key] === undefined) continue;
    if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > 5000) {
      throw Error(`limits.${key} must be an integer between 1 and 5000`);
    }
    limits[key] = value[key];
  }
  return limits;
}

function quickClassification(paths) {
  const observed = deriveObservedImpact(paths);
  const blocked = observed.impact.filter(item => GOVERNED_IMPACTS.has(item));
  return {
    allowed: blocked.length === 0,
    paths: observed.paths,
    impact: observed.impact,
    codeChanged: observed.codeChanged,
    upgradeReasons: blocked.length ? [`Paths contain governed impact: ${blocked.join(', ')}`] : []
  };
}

export async function inspectQuickChange(root, {changeId, baseline = null, declaredFiles = [], limits = DEFAULT_LIMITS, fresh = true} = {}) {
  limits = normalizeLimits(limits);
  if (!changeId) {
    const declared = quickClassification(declaredFiles);
    return {
      allowed: declared.allowed,
      mode: 'declared-only',
      paths: declared.paths,
      impact: declared.impact,
      changedFiles: 0,
      changedLines: null,
      currentFingerprint: null,
      scopeDeviations: [],
      upgradeReasons: declared.upgradeReasons,
      note: 'Declared preflight only; start a quick change to establish a baseline before observing actual changes'
    };
  }
  const observed = await observeChangedSourcePaths(root, {changeId, baseline, fresh});
  if (observed.mode === 'unavailable') {
    return {
      allowed: false,
      mode: observed.mode,
      paths: observed.paths,
      impact: [],
      changedFiles: observed.paths.length,
      changedLines: null,
      currentFingerprint: null,
      upgradeReasons: [observed.reason || 'Quick path requires an InStar change baseline']
    };
  }
  const classification = quickClassification(observed.paths);
  const reasons = [...classification.upgradeReasons];
  if (observed.paths.length > limits.maxFiles) reasons.push(`Changed files ${observed.paths.length} exceed quick limit ${limits.maxFiles}`);
  if (!Number.isInteger(observed.changedLines)) reasons.push('Changed line count is unavailable');
  else if (observed.changedLines > limits.maxChangedLines) reasons.push(`Changed lines ${observed.changedLines} exceed quick limit ${limits.maxChangedLines}`);
  const declared = new Set(declaredFiles);
  const scopeDeviations = declaredFiles.length ? observed.paths.filter(item => !declared.has(item)) : [];
  return {
    allowed: reasons.length === 0,
    mode: observed.mode,
    paths: observed.paths,
    impact: classification.impact,
    changedFiles: observed.paths.length,
    changedLines: observed.changedLines,
    baselineFingerprint: observed.baselineFingerprint,
    currentFingerprint: observed.currentFingerprint,
    ignorePolicy: observed.ignorePolicy,
    scopeDeviations,
    upgradeReasons: [...new Set(reasons)],
    note: 'Changed line count is a conservative baseline-to-current estimate, not an exact line diff'
  };
}

function requireQuickState(state, stage) {
  if (!state || state.path !== 'quick') throw Error('Not a quick change');
  if (state.status === 'completed') throw Error('Quick change is already completed');
  if (stage && state.stage !== stage) throw Error(`Action requires ${stage}; current stage is ${state.stage}`);
}

function bump(state) {
  state.version += 1;
  state.updatedAt = now();
}

function approvalRecord(input, reviewHash, review) {
  if (!DECISIONS.has(input.decision)) throw Error('decision must be accept-record, accept-no-record or reject');
  const record = {decision: input.decision, hash: reviewHash, at: now(), review};
  if (input.decision === 'accept-record') {
    requireText(input.confirmation, 'confirmation');
    record.confirmation = input.confirmation;
    record.recorded = true;
  } else if (input.decision === 'accept-no-record') {
    record.recorded = false;
  } else {
    requireText(input.feedback, 'feedback');
    record.feedback = input.feedback;
  }
  return record;
}

export async function run(input = {}) {
  const root = await projectRoot(input.project);
  const changeId = identifier(input.changeId);
  const file = statePath(changeId);

  if (input.action === 'state') {
    return json(root, file);
  }
  if (input.action === 'classify') {
    const declaredFiles = normalizeFiles(input.files);
    let state = null;
    if (input.changeId) {
      try { state = await json(root, statePath(identifier(input.changeId))); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return inspectQuickChange(root, {changeId: state?.changeId, baseline: state?.baseline, declaredFiles, limits: input.limits});
  }

  return lock(root, async () => {
    if (input.action === 'start') {
      if (await exists(safe(root, file))) throw Error('Quick change already exists');
      if (await exists(safe(root, workflowPath(changeId)))) throw Error('A tracked workflow already uses this changeId');
      const declaredFiles = normalizeFiles(input.files, 'files', {required: true});
      const declared = quickClassification(declaredFiles);
      if (!declared.allowed) throw Error(`${declared.upgradeReasons.join('; ')}; use requirements-workflow`);
      if (input.ui === true) throw Error('UI changes must use requirements-workflow');
      const stack = input.stack ?? 'backend';
      if (!['frontend', 'backend', 'fullstack'].includes(stack)) throw Error('stack must be frontend, backend or fullstack');
      const brief = requireText(input.brief, 'brief');
      if (Buffer.byteLength(brief, 'utf8') > 16 * 1024) throw Error('brief exceeds 16 KiB; reduce it to one page');
      const limits = normalizeLimits(input.limits);
      const briefRelative = briefPath(changeId);
      await atomic(root, briefRelative, `${brief.trim()}\n`);
      const state = {
        schemaVersion: 1,
        path: 'quick',
        changeId,
        title: requireText(input.title, 'title'),
        stack,
        ui: false,
        stage: 'brief',
        status: 'awaiting-approval',
        pendingApproval: 'brief',
        pendingReview: {kind: 'brief', hash: hash(brief.trim())},
        brief: {path: briefRelative, hash: hash(brief.trim())},
        declaredFiles,
        declaredImpact: declared.impact,
        limits,
        approvals: {},
        evidence: null,
        version: 0,
        createdAt: now(),
        updatedAt: now(),
        history: [{at: now(), event: 'started', declaredFiles}]
      };
      const baseline = await captureChangeBaseline(root, changeId);
      state.baseline = baselineReference(baseline, changeId);
      await putJson(root, file, state);
      return state;
    }

    const state = await json(root, file);
    if (input.expectedVersion !== state.version) throw Error('Stale expectedVersion; read state again');

    if (input.action === 'revise-brief') {
      requireQuickState(state, 'brief');
      if (state.status !== 'in-progress' || state.approvals.brief) throw Error('Brief can only be revised after a rejection and before approval');
      const brief = requireText(input.brief, 'brief');
      if (Buffer.byteLength(brief, 'utf8') > 16 * 1024) throw Error('brief exceeds 16 KiB; reduce it to one page');
      const declaredFiles = input.files === undefined ? state.declaredFiles : normalizeFiles(input.files, 'files', {required: true});
      const declared = quickClassification(declaredFiles);
      if (!declared.allowed) throw Error(`${declared.upgradeReasons.join('; ')}; use requirements-workflow`);
      const briefRelative = briefPath(changeId);
      await atomic(root, briefRelative, `${brief.trim()}\n`);
      state.brief = {path: briefRelative, hash: hash(brief.trim())};
      state.declaredFiles = declaredFiles;
      state.declaredImpact = declared.impact;
      state.status = 'awaiting-approval';
      state.pendingApproval = 'brief';
      state.pendingReview = {kind: 'brief', hash: hash(brief.trim())};
      state.history.push({at: now(), event: 'brief-revised', declaredFiles});
      bump(state);
      await putJson(root, file, state);
      return state;
    }

    if (input.action === 'approve') {
      requireQuickState(state, 'brief');
      if (state.status !== 'awaiting-approval') throw Error('Brief is not awaiting approval');
      if (input.reviewHash !== state.pendingReview?.hash) throw Error('reviewHash does not match the current brief');
      const approval = approvalRecord(input, state.pendingReview.hash, 'brief');
      if (approval.decision === 'reject') {
        state.status = 'in-progress';
        state.pendingApproval = null;
        state.pendingReview = null;
        state.history.push({at: now(), event: 'brief-rejected', feedback: approval.feedback});
      } else {
        state.approvals.brief = approval;
        state.stage = 'implementation';
        state.status = 'in-progress';
        state.pendingApproval = null;
        state.pendingReview = null;
        state.history.push({at: now(), event: 'brief-approved', decision: approval.decision, authorization: 'implementation'});
      }
      bump(state);
      await putJson(root, file, state);
      return state;
    }

    if (input.action === 'submit') {
      requireQuickState(state, 'implementation');
      if (state.status !== 'in-progress') throw Error('Implementation is not in progress');
      const checks = normalizeChecks(input.checks);
      if (checks.some(check => check.status !== 'passed')) throw Error('All submitted checks must have status passed');
      if (checks.filter(check => check.name === 'code-review').length !== 1) throw Error('Quick path requires exactly one passed code-review check');
      const summary = requireText(input.summary, 'summary');
      if (Buffer.byteLength(summary, 'utf8') > 16 * 1024) throw Error('summary exceeds 16 KiB');
      const inspection = await inspectQuickChange(root, {changeId: state.changeId, baseline: state.baseline, declaredFiles: state.declaredFiles, limits: state.limits});
      if (!inspection.allowed) throw Error(`${inspection.upgradeReasons.join('; ')}; migrate this change to requirements-workflow`);
      if (!inspection.paths.length) throw Error('No changed files were observed; quick submission requires a real diff');
      const evidence = {
        summary,
        checks,
        files: inspection.paths,
        declaredFiles: state.declaredFiles,
        scopeDeviations: inspection.scopeDeviations,
        changedFiles: inspection.changedFiles,
        changedLines: inspection.changedLines,
        sourceFingerprint: inspection.currentFingerprint,
        baselineFingerprint: state.baseline.fingerprint,
        baselineHash: state.baseline.baselineHash,
        risk: {impact: inspection.impact, mode: inspection.mode}
      };
      state.evidence = evidence;
      state.stage = 'acceptance';
      state.status = 'awaiting-approval';
      state.pendingApproval = 'acceptance';
      state.pendingReview = {kind: 'acceptance', hash: hash(evidence)};
      state.history.push({at: now(), event: 'submitted', changedFiles: inspection.changedFiles, changedLines: inspection.changedLines});
      bump(state);
      await putJson(root, file, state);
      return state;
    }

    if (input.action === 'accept') {
      requireQuickState(state, 'acceptance');
      if (state.status !== 'awaiting-approval') throw Error('Acceptance is not awaiting approval');
      if (input.reviewHash !== state.pendingReview?.hash) throw Error('reviewHash does not match the submitted evidence');
      const approval = approvalRecord(input, state.pendingReview.hash, 'acceptance');
      if (approval.decision === 'reject') {
        state.stage = 'implementation';
        state.status = 'in-progress';
        state.pendingApproval = null;
        state.pendingReview = null;
        state.history.push({at: now(), event: 'acceptance-rejected', feedback: approval.feedback});
      } else {
        const inspection = await inspectQuickChange(root, {changeId: state.changeId, baseline: state.baseline, declaredFiles: state.declaredFiles, limits: state.limits});
        if (inspection.mode === 'unavailable' || !state.evidence?.sourceFingerprint) throw Error('Source binding is unavailable; submit revised acceptance evidence');
        if (!inspection.allowed) throw Error(`${inspection.upgradeReasons.join('; ')}; submit revised acceptance evidence or upgrade the change`);
        if (inspection.currentFingerprint !== state.evidence.sourceFingerprint) throw Error('Source changed after quick submission; submit revised acceptance evidence');
        if (inspection.baselineFingerprint !== state.evidence.baselineFingerprint || state.baseline.baselineHash !== state.evidence.baselineHash) throw Error('Change baseline changed after quick submission; submit revised acceptance evidence');
        state.approvals.acceptance = approval;
        state.stage = 'completed';
        state.status = 'completed';
        state.pendingApproval = null;
        state.pendingReview = null;
        state.history.push({at: now(), event: 'accepted', decision: approval.decision});
      }
      bump(state);
      await putJson(root, file, state);
      return state;
    }

    throw Error(`Unknown quick action: ${input.action}`);
  });
}

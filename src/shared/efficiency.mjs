import {createHash} from 'node:crypto';
import {effectiveRiskLevel} from './risk.mjs';

export const efficiencyLanes = ['fast', 'standard', 'regulated'];

const laneDefinitions = {
  fast: {
    targetMinutes: [30, 38],
    tokenTarget: [18000000, 28000000],
    budgets: {
      modelResponses: 120,
      toolCalls: 180,
      browserActions: 24,
      totalTokens: 28000000,
      qualityGateRuns: 1,
      semanticEvaluations: 4,
      planningApprovals: 1,
    },
  },
  standard: {
    targetMinutes: [45, 70],
    tokenTarget: [28000000, 60000000],
    budgets: {
      modelResponses: 220,
      toolCalls: 320,
      browserActions: 60,
      totalTokens: 60000000,
      qualityGateRuns: 2,
      semanticEvaluations: 4,
      planningApprovals: 1,
    },
  },
  regulated: {
    targetMinutes: [70, 120],
    tokenTarget: [50000000, 100000000],
    budgets: {
      modelResponses: 360,
      toolCalls: 520,
      browserActions: 120,
      totalTokens: 100000000,
      qualityGateRuns: 3,
      semanticEvaluations: 4,
      planningApprovals: 2,
    },
  },
};

const metricNames = [
  'durationMs',
  'modelResponses',
  'toolCalls',
  'browserActions',
  'inputTokens',
  'cachedInputTokens',
  'outputTokens',
  'reasoningTokens',
  'totalTokens',
  'qualityGateRuns',
  'semanticEvaluations',
  'evidenceReused',
];

export function normalizeLane(value = 'fast') {
  if (typeof value !== 'string' || !efficiencyLanes.includes(value)) {
    throw Error('lane must be fast, standard or regulated');
  }
  return value;
}

export const laneRank = value => efficiencyLanes.indexOf(normalizeLane(value));

export function recommendedLane({affectedPaths = [], riskPolicy = null, riskLevel = 'L1'} = {}) {
  if (!Array.isArray(affectedPaths)) return 'standard';
  const effective = effectiveRiskLevel({riskPolicy}, riskLevel, affectedPaths);
  if (effective === 'L3') return 'regulated';
  if (effective === 'L2' || affectedPaths.length > 12) return 'standard';
  return 'fast';
}

export function laneAtLeast(value, minimum) {
  return laneRank(value) >= laneRank(minimum);
}

export function laneDefinition(value = 'fast') {
  const lane = normalizeLane(value);
  return structuredClone({lane, ...laneDefinitions[lane]});
}

export function initialEfficiency({lane = 'fast', affectedPaths = [], minimumLane = null, startedAt = new Date().toISOString()} = {}) {
  const selected = normalizeLane(lane);
  const definition = laneDefinition(selected);
  return {
    schemaVersion: 1,
    lane: selected,
    startedAt,
    targetMinutes: definition.targetMinutes,
    tokenTarget: definition.tokenTarget,
    budgets: definition.budgets,
    riskFloor: minimumLane ? normalizeLane(minimumLane) : null,
    metrics: Object.fromEntries(metricNames.map(name => [name, 0])),
    reportedBySkill: false,
  };
}

export function validateMetrics(metrics = {}) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) throw Error('metrics must be an object');
  const result = {};
  for (const [name, value] of Object.entries(metrics)) {
    if (!metricNames.includes(name)) throw Error(`Unknown efficiency metric: ${name}`);
    if (!Number.isFinite(value) || value < 0 || (name !== 'durationMs' && !Number.isInteger(value))) {
      throw Error(`Invalid efficiency metric: ${name}`);
    }
    if (name === 'durationMs' && value > 7 * 24 * 60 * 60 * 1000) throw Error('durationMs exceeds seven days');
    result[name] = value;
  }
  return result;
}

function terminalSkillRecords(traces = [], changeId = null) {
  const byInvocation = new Map();
  for (const record of traces) {
    if (record?.type !== 'skill-invocation') continue;
    if (changeId && record.changeId !== changeId) continue;
    const current = byInvocation.get(record.invocationId);
    if (!current || record.event !== 'started') byInvocation.set(record.invocationId, record);
  }
  return [...byInvocation.values()].filter(record => ['completed','failed'].includes(record.event));
}

export function summarizeEfficiency({state = null, traces = [], now = new Date()} = {}) {
  if (!state?.efficiency) return null;
  const definition = laneDefinition(state.efficiency.lane || 'fast');
  const metrics = Object.fromEntries(metricNames.map(name => [name, 0]));
  const records = terminalSkillRecords(traces, state.changeId);
  for (const record of records) {
    for (const [name, value] of Object.entries(validateMetrics(record.metrics || {}))) {
      metrics[name] += value;
    }
  }
  if (!metrics.totalTokens) metrics.totalTokens = metrics.inputTokens + metrics.outputTokens;
  const started = Date.parse(state.efficiency.startedAt || state.history?.[0]?.at || now.toISOString());
  const finished = state.status === 'completed' && state.history?.length ? Date.parse(state.history.at(-1).at) : now.getTime();
  const elapsedMs = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0;
  const activeMs = metrics.durationMs;
  const waitMs = Math.max(0, elapsedMs - activeMs);
  const exceeded = [];
  for (const [name, limit] of Object.entries(definition.budgets)) {
    if (metrics[name] > limit) exceeded.push({ metric: name, used: metrics[name], limit });
  }
  if (activeMs > definition.targetMinutes[1] * 60 * 1000) {
    exceeded.push({ metric: 'activeMinutes', used: Math.round(activeMs / 60000), limit: definition.targetMinutes[1] });
  }
  return {
    schemaVersion: 1,
    lane: definition.lane,
    riskFloor: state.efficiency.riskFloor ?? null,
    targetMinutes: definition.targetMinutes,
    tokenTarget: definition.tokenTarget,
    budgets: definition.budgets,
    usage: { ...metrics, elapsedMs, activeMs, waitMs },
    timeBasis: 'active-skill-time',
    reportedBySkill: records.some(record => record.metrics && Object.keys(record.metrics).length),
    status: exceeded.length ? 'over-budget' : 'within-budget',
    exceeded,
  };
}

export function efficiencyFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

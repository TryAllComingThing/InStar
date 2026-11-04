import {createHash} from 'node:crypto';
import {effectiveRiskLevel} from './risk.mjs';

export const efficiencyLanes = ['micro', 'quick', 'fast', 'standard', 'regulated'];

const laneDefinitions = {
  micro: {
    targetMinutes: [10, 20],
    tokenTarget: [8000000, 12000000],
    budgets: {
      modelResponses: 40,
      toolCalls: 60,
      browserActions: 8,
      totalTokens: 12000000,
      qualityGateRuns: 1,
      semanticEvaluations: 0,
      planningApprovals: 0,
    },
  },
  quick: {
    targetMinutes: [20, 30],
    tokenTarget: [12000000, 18000000],
    budgets: {
      modelResponses: 60,
      toolCalls: 100,
      browserActions: 12,
      totalTokens: 18000000,
      qualityGateRuns: 1,
      semanticEvaluations: 2,
      planningApprovals: 0,
    },
  },
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
    throw Error('lane must be micro, quick, fast, standard or regulated');
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

export function riskMinimumLane(riskLevel = 'L1') {
  if (riskLevel === 'L3') return 'regulated';
  if (riskLevel === 'L2') return 'standard';
  return 'micro';
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
    metrics: Object.fromEntries(metricNames.map(name => [name, null])),
    metricStatus: Object.fromEntries(metricNames.map(name => [name, 'missing'])),
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

function aggregateMetrics(records) {
  const metrics = Object.fromEntries(metricNames.map(name => [name, null]));
  const metricStatus = Object.fromEntries(metricNames.map(name => [name, 'missing']));
  let observedRecords = 0;
  for (const record of records) {
    const values = validateMetrics(record.metrics || {});
    if (Object.keys(values).length) observedRecords++;
    for (const [name, value] of Object.entries(values)) {
      metrics[name] = (metrics[name] ?? 0) + value;
      metricStatus[name] = 'observed';
    }
  }
  if (metrics.totalTokens === null && metrics.inputTokens !== null && metrics.outputTokens !== null) {
    metrics.totalTokens = metrics.inputTokens + metrics.outputTokens;
    metricStatus.totalTokens = 'derived';
  }
  return {metrics, metricStatus, observedRecords};
}

function observedBytesFor(records) {
  let observed = null;
  for (const record of records) {
    const value = Number.isInteger(record.bytes) && record.bytes >= 0
      ? record.bytes
      : Number.isInteger(record.inputBytes) && record.inputBytes >= 0 && Number.isInteger(record.outputBytes) && record.outputBytes >= 0
        ? record.inputBytes + record.outputBytes
        : null;
    if (value !== null) observed = (observed ?? 0) + value;
  }
  return observed;
}

export function summarizeEfficiency({state = null, traces = [], now = new Date()} = {}) {
  if (!state?.efficiency) return null;
  const definition = laneDefinition(state.efficiency.lane || 'fast');
  const records = terminalSkillRecords(traces, state.changeId);
  const {metrics, metricStatus, observedRecords} = aggregateMetrics(records);
  const byStage = {}, bySkill = {};
  for (const record of records) {
    const groups = [[byStage, record.stage || 'unattributed'], [bySkill, record.skill || 'unknown']];
    for (const [group, key] of groups) (group[key] ??= []).push(record);
  }
  const summarizeGroups = groups => Object.fromEntries(Object.entries(groups).sort(([left], [right]) => left.localeCompare(right)).map(([key, items]) => {
    const aggregate = aggregateMetrics(items);
    return [key, {records:items.length, observedRecords:aggregate.observedRecords, usage:aggregate.metrics, metricStatus:aggregate.metricStatus, status:aggregate.observedRecords ? 'observed' : 'insufficient-telemetry'}];
  }));
  const observedBytes = observedBytesFor(records);
  const started = Date.parse(state.efficiency.startedAt || state.history?.[0]?.at || now.toISOString());
  const finished = state.status === 'completed' && state.history?.length ? Date.parse(state.history.at(-1).at) : now.getTime();
  const elapsedMs = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0;
  const activeMs = metrics.durationMs;
  const waitMs = activeMs === null ? null : Math.max(0, elapsedMs - activeMs);
  const exceeded = [];
  for (const [name, limit] of Object.entries(definition.budgets)) {
    if (metrics[name] !== null && metrics[name] > limit) exceeded.push({ metric: name, used: metrics[name], limit });
  }
  if (activeMs !== null && activeMs > definition.targetMinutes[1] * 60 * 1000) {
    exceeded.push({ metric: 'activeMinutes', used: Math.round(activeMs / 60000), limit: definition.targetMinutes[1] });
  }
  const missingMetrics = Object.keys(definition.budgets).filter(name => metrics[name] === null);
  const status = exceeded.length ? 'over-budget' : observedRecords === 0 || missingMetrics.length ? 'insufficient-telemetry' : 'within-budget';
  return {
    schemaVersion: 1,
    lane: definition.lane,
    riskFloor: state.efficiency.riskFloor ?? null,
    targetMinutes: definition.targetMinutes,
    tokenTarget: definition.tokenTarget,
    budgets: definition.budgets,
    usage: { ...metrics, elapsedMs, activeMs, waitMs },
    metricStatus: { ...metricStatus, elapsedMs: 'derived', activeMs: metricStatus.durationMs, waitMs: activeMs === null ? 'missing' : 'derived' },
    missingMetrics,
    observedRecords,
    observedBytes,
    observedBytesStatus: observedBytes === null ? 'missing' : 'observed',
    byStage: summarizeGroups(byStage),
    bySkill: summarizeGroups(bySkill),
    timeBasis: 'active-skill-time',
    reportedBySkill: records.some(record => record.metrics && Object.keys(record.metrics).length),
    status,
    exceeded,
  };
}

export function efficiencyFingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

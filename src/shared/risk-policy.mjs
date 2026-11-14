const RISK_TIERS = Object.freeze(['lean', 'standard', 'governed']);
const IMPACT_AREAS = Object.freeze([
  'documentation',
  'copy',
  'tests',
  'local',
  'ui',
  'authentication',
  'authorization',
  'security',
  'secrets',
  'data',
  'data-migration',
  'api-contract',
  'architecture',
  'dependencies',
  'infrastructure'
]);

const LEAN_IMPACTS = new Set(['documentation', 'copy', 'tests', 'local']);
const GOVERNED_IMPACTS = new Set([
  'authentication',
  'authorization',
  'security',
  'secrets',
  'data',
  'data-migration',
  'api-contract',
  'architecture',
  'dependencies',
  'infrastructure'
]);
const RISK_INPUT_FIELDS = new Set(['tier', 'riskTier', 'impact', 'reason']);
const DOCUMENTATION_PATH = /\.(?:md|mdx)$|\/docs?\//i;
const TEST_PATH = /(^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\.[^/]+$/i;
const COPY_PATH = /(^|\/)(?:i18n|locales?|copy)\//i;
const EXECUTABLE_PATH = /\.(?:mjs|cjs|js|jsx|ts|tsx|vue|svelte|astro|html?|css|scss|sass|less|styl|php|rb|py|go|rs|java|kt|kts|cs|swift|sh|bash|zsh|ps1|sql)$/i;

function unique(values) {
  return [...new Set(values)];
}

function normalizeImpact(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > IMPACT_AREAS.length) throw Error('risk.impact must be an array of known impact areas');
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string' || !IMPACT_AREAS.includes(item)) throw Error(`risk.impact contains unknown area: ${item}`);
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

function normalizeObservedPaths(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5000) throw Error('observedPaths must be an array with at most 5000 paths');
  return unique(value.map((item, index) => {
    if (typeof item !== 'string' || !item.trim() || item.includes('\0')) throw Error(`observedPaths[${index}] must be a non-empty path`);
    return item.replaceAll('\\', '/').trim();
  }));
}

function isNoticePath(path) {
  return DOCUMENTATION_PATH.test(path) || TEST_PATH.test(path) || (COPY_PATH.test(path) && !EXECUTABLE_PATH.test(path));
}

function addImpact(target, areas) {
  for (const area of areas) if (!target.includes(area)) target.push(area);
}

/**
 * Derive high-impact areas from actual changed paths. This is deliberately
 * conservative: any changed code path that is not documentation, copy or tests
 * prevents lean risk, even when no specific governed pattern matches.
 */
export function deriveObservedImpact(paths) {
  if (!Array.isArray(paths)) throw Error('observed paths must be an array');
  const normalized = normalizeObservedPaths(paths);
  const impact = [];
  let codeChanged = false;
  const rules = [
    [/auth(?:entication)?|login|logout|session|sso/i, ['authentication']],
    [/permission|authoriz|rbac|acl|roles?/i, ['authorization']],
    [/security|csrf|csp|sanitiz|crypto/i, ['security']],
    [/secret|credential|private[-_]?key|\.env(?:\.|$)/i, ['secrets']],
    [/migrat/i, ['data-migration', 'data']],
    [/(^|\/)(?:db|database|repositories?|dao|models?)(\/|$)|\.sql$|schema/i, ['data']],
    [/(^|\/)(?:api|openapi|swagger|graphql)(\/|$)|\/routes?\/|\/controllers?\/|\.dto\.|api-contract/i, ['api-contract']],
    [/architecture|(^|\/)ARCHITECTURE\.md$/i, ['architecture']],
    [/(^|\/)(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|poetry\.lock|Pipfile\.lock|requirements[^/]*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle|pyproject\.toml)$/i, ['dependencies']],
    [/(^|\/)(?:\.instarignore|\.instar-quality\.json|\.instar\.json)$|(^|\/)(?:hooks|\.codex)\//i, ['infrastructure']],
    [/(^|\/)(?:\.github\/workflows|dockerfile|docker-compose|terraform|helm|k8s|infra)(\/|$)|(?:vite|webpack|rollup|esbuild)\.config|tsconfig|eslint\.config/i, ['infrastructure']],
    [/\.(?:vue|tsx|jsx|css|scss|sass|less|html)$|\/(?:components|pages|features|views|ui)\//i, ['ui']],
    [/\.(?:md|mdx)$|\/docs?\//i, ['documentation']],
    [/(^|\/)(?:tests?|__tests__)\/|\.(?:test|spec)\.[^/]+$/i, ['tests']],
    [/(^|\/)(?:i18n|locales?|copy)\//i, ['copy']]
  ];
  for (const path of normalized) {
    if (!isNoticePath(path)) codeChanged = true;
    if (DOCUMENTATION_PATH.test(path)) addImpact(impact, ['documentation']);
    if (TEST_PATH.test(path)) addImpact(impact, ['tests']);
    if (COPY_PATH.test(path) && !EXECUTABLE_PATH.test(path)) addImpact(impact, ['copy']);
    if (isNoticePath(path)) continue;
    for (const [pattern, areas] of rules) if (pattern.test(path)) addImpact(impact, areas);
  }
  return {impact, codeChanged, paths: normalized};
}

export { RISK_TIERS, IMPACT_AREAS };

export function classifyRisk(input = {}, context = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('risk must be an object');
  const unknown = Object.keys(input).filter(key => !RISK_INPUT_FIELDS.has(key));
  if (unknown.length) throw Error(`risk contains unknown fields: ${unknown.join(', ')}`);
  if (input.tier !== undefined && input.riskTier !== undefined && input.tier !== input.riskTier) {
    throw Error('risk.tier and risk.riskTier must match');
  }
  const requestedTier = input.tier ?? input.riskTier ?? 'standard';
  if (!RISK_TIERS.includes(requestedTier)) throw Error(`risk.tier must be ${RISK_TIERS.join(', ')}`);
  const declaredImpact = normalizeImpact(input.impact);
  const observedImpact = normalizeImpact(context.observedImpact);
  const observedPaths = normalizeObservedPaths(context.observedPaths);
  const impact = unique([...declaredImpact, ...observedImpact]);
  const reasons = [];
  if (input.reason !== undefined) {
    if (typeof input.reason !== 'string' || !input.reason.trim()) throw Error('risk.reason must be a nonempty string');
    reasons.push(input.reason.trim());
  }

  let tier = requestedTier;
  const governedImpacts = impact.filter(item => GOVERNED_IMPACTS.has(item));
  if (governedImpacts.length) {
    if (tier !== 'governed') reasons.push(`High-impact areas require governed risk: ${governedImpacts.join(', ')}`);
    tier = 'governed';
  }

  if (tier === 'lean' && (context.ui === true || impact.includes('ui'))) {
    reasons.push('UI changes cannot use lean risk');
    tier = 'standard';
  }

  if (tier === 'lean' && observedPaths.some(path => !isNoticePath(path))) {
    reasons.push('Observed non-documentation changes require at least standard risk');
    tier = 'standard';
  }

  if (observedImpact.length) reasons.push(`Observed changes affect: ${observedImpact.join(', ')}`);

  if (tier === 'lean') {
    if (!impact.length) throw Error('lean risk requires an explicit impact list');
    const unsupported = impact.filter(item => !LEAN_IMPACTS.has(item));
    if (unsupported.length) throw Error(`lean risk only supports ${[...LEAN_IMPACTS].join(', ')}; found: ${unsupported.join(', ')}`);
  }

  if (requestedTier === 'governed' && !governedImpacts.length && !reasons.length) reasons.push('Explicit governed risk classification');
  return {
    schemaVersion: 1,
    tier,
    requestedTier,
    source: input.tier !== undefined || input.riskTier !== undefined ? 'explicit' : 'inferred',
    declaredImpact,
    observedImpact,
    impact,
    reasons,
    layers: tier === 'lean' ? ['L1', 'L3'] : ['L1', 'L2', 'L3'],
    requireSecurityEvidence: tier === 'governed'
  };
}

export function riskFor(state = {}) {
  if (state.risk) return state.risk;
  return classifyRisk({}, { ui: state.ui === true });
}

export function effectiveUi(state = {}) {
  return state.ui === true || state.stack === 'frontend' || state.risk?.impact?.includes('ui') === true || state.risk?.observedImpact?.includes('ui') === true;
}

export function requiredVerificationLayers(risk = {}) {
  const tier = RISK_TIERS.includes(risk.tier) ? risk.tier : 'standard';
  return {
    tier,
    layers: tier === 'lean' ? ['L1', 'L3'] : ['L1', 'L2', 'L3'],
    requireSecurityEvidence: tier === 'governed',
    cacheIntermediate: true,
    frozenFullUncached: true
  };
}

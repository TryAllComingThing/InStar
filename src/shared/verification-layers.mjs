import path from 'node:path';
import {canonicalHash, contentHash} from './canonical.mjs';
import {lstatVerified,readBufferVerified,readDirectoryVerified} from './path-safety.mjs';

export const VERIFICATION_LAYERS = Object.freeze(['L1', 'L2', 'L3']);
const ALIASES = new Map([
  ['L1', 'L1'], ['CHANGED-UNIT', 'L1'],
  ['L2', 'L2'], ['TASK-UNIT', 'L2'],
  ['L3', 'L3'], ['FROZEN-FULL', 'L3']
]);
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'poetry.lock', 'Pipfile.lock'];
const UI_KINDS = new Set(['browser', 'accessibility', 'keyboard']);
const SENSITIVE = /(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/;

export function normalizeVerificationLayer(value) {
  if (typeof value !== 'string') throw Error('verification layer must be L1, L2 or L3');
  const layer = ALIASES.get(value.trim().toUpperCase());
  if (!layer) throw Error('verification layer must be L1, L2 or L3');
  return layer;
}

export function layerReportKind(layer) {
  const normalized = normalizeVerificationLayer(layer);
  if (normalized === 'L3') return 'engineering-verify-full';
  return `engineering-verify-${normalized}`;
}

export function layerReportPath(layer) {
  return `reports/${layerReportKind(layer)}.json`;
}

export function layerCheckIds(config, layer) {
  const normalized = normalizeVerificationLayer(layer);
  if (normalized === 'L3') return config?.verification?.profiles?.full || [];
  const ids = config?.verification?.layers?.[normalized];
  if (!Array.isArray(ids) || !ids.length) throw Error(`verification.layers.${normalized} must configure at least one check`);
  return ids;
}

export function assertFrozenFullProfile(config) {
  const ids = config?.verification?.profiles?.full;
  if (!Array.isArray(ids) || !ids.length) throw Error('L3 frozen-full requires verification.profiles.full');
  const buildIndex = ids.findIndex(id => config?.tools?.checks?.[id]?.kind === 'build');
  if (buildIndex < 0) throw Error('L3 frozen-full requires a build check in verification.profiles.full');
  const firstUi = ids.findIndex(id => UI_KINDS.has(config?.tools?.checks?.[id]?.kind));
  if (firstUi >= 0 && firstUi < buildIndex) throw Error('L3 frozen-full must run build before browser/accessibility/keyboard checks');
  for (const id of ids) validateUiCheckContract(config, id);
}

export function validateUiCheckContract(config, id) {
  const spec = config?.tools?.checks?.[id];
  if (!spec || !UI_KINDS.has(spec.kind)) return;
  if (!Array.isArray(spec.routes) || !spec.routes.length || spec.routes.some(value => typeof value !== 'string' || !value.trim())) {
    throw Error(`tools.checks.${id}.routes must declare the routes covered by its ${spec.kind} artifact`);
  }
  if (!Array.isArray(spec.browserMatrix) || !spec.browserMatrix.length || spec.browserMatrix.some(value => typeof value !== 'string' || !value.trim())) {
    throw Error(`tools.checks.${id}.browserMatrix must declare the browsers covered by its ${spec.kind} artifact`);
  }
}

function supportsAffectedFiles(spec) {
  return spec?.incremental === true || (Array.isArray(spec?.args) && spec.args.some(arg => typeof arg === 'string' && arg.includes('{files}')));
}

function relativePath(value, label) {
  if (typeof value !== 'string' || !value.trim() || path.isAbsolute(value) || value.includes('\0') || value.includes('\n') || value.includes('\r') || value.split(/[\\/]/).includes('..') || SENSITIVE.test(value)) {
    throw Error(`${label} must be a safe workspace-relative path`);
  }
  return value;
}

export function validateVerificationLayers(config) {
  const layers = config?.verification?.layers;
  const cache = config?.verification?.cache;
  if (cache !== undefined) {
    if (!cache || typeof cache !== 'object' || Array.isArray(cache)) throw Error('verification.cache must be an object');
    if (cache.enabled !== undefined && typeof cache.enabled !== 'boolean') throw Error('verification.cache.enabled must be a boolean');
    if (cache.buildOutputs !== undefined) {
      if (!Array.isArray(cache.buildOutputs) || cache.buildOutputs.length > 20 || new Set(cache.buildOutputs).size !== cache.buildOutputs.length) throw Error('verification.cache.buildOutputs must be a unique array with at most 20 paths');
      for (const item of cache.buildOutputs) relativePath(item, 'verification.cache.buildOutputs item');
    }
  }
  // Schema 3 full is the frozen production profile regardless of whether an
  // intermediate L1/L2 layer map exists. A missing layer map must never make
  // the build requirement skippable.
  assertFrozenFullProfile(config);
  if (layers === undefined) return;
  if (!layers || typeof layers !== 'object' || Array.isArray(layers)) throw Error('verification.layers must be an object');
  const unknown = Object.keys(layers).filter(key => !['L1', 'L2'].includes(key));
  if (unknown.length) throw Error(`verification.layers only configures L1 and L2; L3 always uses verification.profiles.full (found: ${unknown.join(', ')})`);
  for (const layer of ['L1', 'L2']) {
    const ids = layers[layer];
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw Error(`verification.layers.${layer} must be a non-empty unique check list`);
    for (const id of ids) {
      const spec = config.tools?.checks?.[id];
      if (!spec) throw Error(`verification.layers.${layer} references unknown check: ${id}`);
      if (!['lint','format','typecheck','test','build','security','browser','accessibility','keyboard','dependencies'].includes(spec.kind)) throw Error(`verification.layers.${layer}.${id} has invalid kind`);
      if (spec.kind === 'build') throw Error('L1/L2 must not run build; the one production build belongs to L3 frozen-full');
      if (spec.incremental !== undefined && typeof spec.incremental !== 'boolean') throw Error(`tools.checks.${id}.incremental must be a boolean`);
      if (spec.toolVersion !== undefined && (typeof spec.toolVersion !== 'string' || !spec.toolVersion.trim() || spec.toolVersion.length > 160)) throw Error(`tools.checks.${id}.toolVersion must be a nonempty string no longer than 160 characters`);
      for (const field of ['routes', 'browserMatrix']) {
        if (spec[field] !== undefined && (!Array.isArray(spec[field]) || !spec[field].length || spec[field].some(value => typeof value !== 'string' || !value.trim()))) throw Error(`tools.checks.${id}.${field} must be a non-empty string array`);
      }
      if (cache?.enabled !== false) assertCacheableCheck(config, id, spec);
    }
    if (layer === 'L1') {
      for (const id of ids) if (!supportsAffectedFiles(config.tools.checks[id])) throw Error(`verification.layers.L1.${id} must use an args placeholder {files} or declare incremental:true`);
    }
  }
  const l2Kinds = new Set(layers.L2.map(id => config.tools.checks[id].kind));
  if (!l2Kinds.has('test')) throw Error('verification.layers.L2 must include an all-unit test check');
  const allUnitIds = layers.L2.filter(id => config.tools.checks[id].kind === 'test' && config.tools.checks[id].incremental !== true && !supportsAffectedFiles(config.tools.checks[id]));
  if (!allUnitIds.length) throw Error('verification.layers.L2 must include a non-incremental all-unit test check without {files}');
  const overlap = layers.L1.filter(id => layers.L2.includes(id));
  if (overlap.length) throw Error(`verification.layers.L1 and L2 must use distinct checks: ${overlap.join(', ')}`);
  const configuredBrowserIds = [...new Set([...(config.verification.profiles?.implementation || []), ...(config.verification.profiles?.full || []), ...layers.L1, ...layers.L2])].filter(id => config.tools.checks[id]?.kind === 'browser');
  if (configuredBrowserIds.length) {
    const affectedBrowserIds = layers.L2.filter(id => config.tools.checks[id]?.kind === 'browser');
    if (!affectedBrowserIds.length) throw Error('verification.layers.L2 must include an affected browser/E2E check when browser checks are configured');
    for (const id of affectedBrowserIds) if (!supportsAffectedFiles(config.tools.checks[id])) throw Error(`verification.layers.L2.${id} must support affected files through {files} or incremental:true`);
  }
}

export function assertCacheableCheck(config, id, spec) {
  if (config.verification?.cache?.enabled === false) return;
  if (typeof spec.toolVersion !== 'string' || !spec.toolVersion.trim()) throw Error(`Cached layer check ${id} requires tools.checks.${id}.toolVersion`);
  if (UI_KINDS.has(spec.kind)) {
    if (!Array.isArray(spec.routes) || !spec.routes.length) throw Error(`Cached UI check ${id} requires tools.checks.${id}.routes`);
    if (!Array.isArray(spec.browserMatrix) || !spec.browserMatrix.length) throw Error(`Cached UI check ${id} requires tools.checks.${id}.browserMatrix`);
  }
}

export function normalizeLayerFiles(value, fallback = []) {
  const source = value === undefined ? fallback : value;
  if (!Array.isArray(source) || source.length > 5000) throw Error('layer files must be an array with at most 5000 paths');
  const files = [...new Set(source.map((item, index) => relativePath(item, `layer files[${index}]`)))].sort();
  return files;
}

export function expandLayerArgs(spec, files) {
  const args = [];
  for (const arg of spec.args) {
    if (!arg.includes('{files}')) { args.push(arg); continue; }
    if (!files.length) throw Error(`Check ${spec.command} requires changed files but none were provided or discovered`);
    if (arg === '{files}') args.push(...files);
    else args.push(arg.replaceAll('{files}', files.join(',')));
  }
  if (args.length > 2048) throw Error('Expanded check arguments exceed 2048 items');
  return args;
}

export async function lockfileHash(root) {
  const entries = [];
  for (const name of LOCKFILES) {
    try { entries.push({name, hash: contentHash(await readBufferVerified(root, name))}); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return canonicalHash(entries.length ? entries : [{name: 'none', hash: 'none'}]);
}

async function hashBuildPath(root, relative, state) {
  let stat;
  try { stat = await lstatVerified(root, relative); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink()) throw Error(`Build output cannot be a symlink: ${relative}`);
  if (stat.isFile()) {
    state.files += 1; state.bytes += stat.size;
    if (state.files > 20000 || state.bytes > 512 * 1024 * 1024) throw Error('Build cache fingerprint exceeds 20,000 files or 512 MiB');
    state.entries.push({path: relative, hash: contentHash(await readBufferVerified(root, relative))});
    return;
  }
  if (!stat.isDirectory()) return;
  const entries = (await readDirectoryVerified(root, relative, {label: `build output ${relative}`})).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw Error(`Build output cannot contain symlinks: ${relative}/${entry.name}`);
    await hashBuildPath(root, `${relative}/${entry.name}`, state);
  }
  await readDirectoryVerified(root, relative, {label: `build output ${relative}`});
}

export async function buildOutputHash(root, config) {
  const outputs = config.verification?.cache?.buildOutputs ?? ['dist', 'build'];
  const state = {files: 0, bytes: 0, entries: []};
  for (const output of outputs) await hashBuildPath(root, relativePath(output, 'build output'), state);
  return canonicalHash(state.entries.length ? state.entries : [{path: 'none', hash: 'none'}]);
}

export function cacheComponents(config, snapshot, hashes, id, spec, files) {
  const args = expandLayerArgs(spec, files);
  return {
    checkId: id,
    kind: spec.kind,
    command: {executable: spec.command, argsHash: canonicalHash(args)},
    filesHash: canonicalHash(files),
    configHash: canonicalHash(config),
    sourceHash: hashes.sourceUnitHash || snapshot.fingerprint,
    lockfileHash: hashes.lockfileHash,
    toolVersion: spec.toolVersion,
    buildHash: hashes.buildHash,
    routes: spec.routes || [],
    browserMatrix: spec.browserMatrix || []
  };
}

export function cacheKey(components) { return canonicalHash(components); }
export function cachePath(layer, key) { return `reports/cache/${normalizeVerificationLayer(layer)}/${key}.json`; }

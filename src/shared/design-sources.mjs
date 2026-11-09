import {lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readBufferVerified} from './path-safety.mjs';

const designSourceRoles = ['design-contract','design-system','tokens','component','reference'];

const MAX_SOURCES = 40;
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const roleExtensions = {
  'design-contract': /\.(md|mdx)$/i,
  'design-system': /\.(md|mdx)$/i,
  tokens: /\.(css|scss|sass|less|json|ya?ml|js|mjs|cjs|ts|mts|cts)$/i,
  component: /\.(vue|svelte|astro|html?|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|mts|cts)$/i,
  reference: /\.(md|mdx|txt|html?|png|jpe?g|webp|gif|avif|svg|pdf)$/i
};
const mediaTypes = {
  md:'text/markdown',mdx:'text/markdown',css:'text/css',scss:'text/x-scss',sass:'text/x-sass',less:'text/less',
  json:'application/json',yaml:'application/yaml',yml:'application/yaml',js:'text/javascript',mjs:'text/javascript',cjs:'text/javascript',
  jsx:'text/javascript',ts:'text/typescript',tsx:'text/typescript',mts:'text/typescript',cts:'text/typescript',
  vue:'text/vue',svelte:'text/svelte',astro:'text/astro',html:'text/html',htm:'text/html',txt:'text/plain',
  svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',pdf:'application/pdf'
};
const sensitive = name => /(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/.test(name);
const reserved = name => /(^|\/)(\.git|node_modules|\.instar|reports|logs|planning|dist|build|coverage|\.next|\.nuxt|vendor)(\/|$)/.test(name);
const extension = relative => path.posix.extname(relative).slice(1).toLowerCase();

function normalizeRelative(value) {
  if (typeof value !== 'string' || !value.trim() || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw Error('designCheck source must be a workspace-relative path');
  }
  const parts = value.split(/[\\/]/).filter(part => part && part !== '.');
  if (!parts.length || parts.includes('..')) throw Error('designCheck source must not contain parent traversal');
  return parts.join('/');
}

function inferDesignSourceRole(relative) {
  const name = relative.toLowerCase();
  const ext = extension(relative);
  if (/\.(png|jpe?g|webp|gif|avif|svg|pdf)$/.test(name)) return 'reference';
  if (['md','mdx'].includes(ext)) {
    if (/design-system(?:\.mdx?)?$/.test(name) || name.includes('/design-system/')) return 'design-system';
    return 'design-contract';
  }
  if (/(^|[\/_.-])(tokens?|themes?|variables?|colors?|design-tokens?)([\/_.-]|$)/.test(name) && /\.(css|scss|sass|less|json|ya?ml|js|mjs|cjs|ts|mts|cts)$/.test(name)) return 'tokens';
  if (['vue','svelte','astro','html','htm','css','scss','sass','less','js','jsx','mjs','cjs','ts','tsx','mts','cts'].includes(ext)) return 'component';
  if (['json','yaml','yml','txt'].includes(ext)) return 'reference';
  return null;
}

function sourceType(relative) {
  return mediaTypes[extension(relative)] || 'application/octet-stream';
}

async function inspectFile(root, relative) {
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) throw Error(`designCheck source is outside the workspace: ${relative}`);
  let current = root;
  for (const [index, part] of relative.split('/').entries()) {
    current = path.join(current, part);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (error.code === 'ENOENT') throw Error(`designCheck source is missing: ${relative}`);
      throw error;
    }
    if (stat.isSymbolicLink()) throw Error(`designCheck source must not use symbolic links: ${relative}`);
    const last = index === relative.split('/').length - 1;
    if (!last && !stat.isDirectory()) throw Error(`designCheck source parent is not a directory: ${relative}`);
    if (last && !stat.isFile()) throw Error(`designCheck source must be a regular file: ${relative}`);
    if (last) return {full,stat};
  }
  throw Error(`designCheck source is empty: ${relative}`);
}

export async function inspectDesignSource(root, value, {inferLegacy = false} = {}) {
  const input = typeof value === 'string' ? {path:value} : value;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('designCheck source must be an object with path and role');
  const relative = normalizeRelative(input.path);
  if (sensitive(relative)) throw Error(`designCheck source must not target sensitive files: ${relative}`);
  if (reserved(relative)) throw Error(`designCheck source must not target generated or controller paths: ${relative}`);
  const role = input.role ?? (inferLegacy ? inferDesignSourceRole(relative) : null);
  if (!designSourceRoles.includes(role)) throw Error(`designCheck source role must be one of: ${designSourceRoles.join(', ')}: ${relative}`);
  if (!roleExtensions[role].test(relative)) throw Error(`designCheck source role ${role} does not allow this file type: ${relative}`);
  if (role === 'tokens' && !/\.(css|scss|sass|less)$/i.test(relative) && !/(^|[\/_.-])(tokens?|themes?|variables?|colors?|design-tokens?)([\/_.-]|$)/i.test(relative) && !relative.toLowerCase().includes('/design-system/')) throw Error(`designCheck source role tokens requires a stylesheet or token-like path: ${relative}`);
  const {stat} = await inspectFile(root, relative);
  if (stat.size > MAX_SOURCE_BYTES) throw Error(`designCheck source exceeds ${MAX_SOURCE_BYTES} byte limit: ${relative}`);
  const content=await readBufferVerified(root,relative);
  if(content.length>MAX_SOURCE_BYTES)throw Error(`designCheck source exceeds ${MAX_SOURCE_BYTES} byte limit: ${relative}`);
  return {path:relative,role,type:sourceType(relative),sha256:createHash('sha256').update(content).digest('hex'),bytes:content.length};
}

export async function resolveDesignCheckSources(root, sources, {inferLegacy = false} = {}) {
  if (!Array.isArray(sources) || !sources.length) throw Error('designCheck.sources must be a non-empty array');
  if (sources.length > MAX_SOURCES) throw Error(`designCheck.sources must contain at most ${MAX_SOURCES} files`);
  const resolved = [],seen = new Set();
  for (const source of sources) {
    const item = await inspectDesignSource(root, source, {inferLegacy});
    if (seen.has(item.path)) throw Error(`designCheck.sources contains a duplicate path: ${item.path}`);
    seen.add(item.path);
    resolved.push(item);
  }
  return resolved;
}

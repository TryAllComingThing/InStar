import { lstat } from 'node:fs/promises';
import path from 'node:path';

const tokenCandidates = [
  'design-tokens.json', 'tokens.json', 'tokens.css', 'src/tokens.css',
  'src/styles/tokens.css', 'src/styles/design-tokens.css',
  'src/design-system/tokens.css', 'styles/tokens.css',
  'design-system/tokens.css', 'frontend/src/styles/tokens.css',
  'frontend/src/styles/design-tokens.css', 'frontend/src/design-system/tokens.css',
  'frontend/design-system/tokens.css'
];

function normalizeRelative(value) {
  if (typeof value !== 'string' || !value.trim() || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    throw Error('Token source must be a workspace-relative path without parent traversal');
  }
  const parts = value.split(/[\\/]/).filter(part => part && part !== '.');
  if (!parts.length) throw Error('Token source path is empty');
  const relative=parts.join('/');
  if(/(^|\/)(\.ssh|\.aws)(\/|$)|(^|\/)\.env(?:\.|$)/.test(relative))throw Error('Token source must not be a sensitive path');
  if(/(^|\/)(\.git|node_modules|\.instar|reports|logs|planning|dist|build|coverage|\.next|\.nuxt|vendor)(\/|$)/.test(relative))throw Error('Token source must not be a generated or managed path');
  return relative;
}

async function inspect(root, relative) {
  let current = root;
  const parts = relative.split('/');
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat;
    try { stat = await lstat(current); }
    catch (error) {
      if (error.code === 'ENOENT') return { path: relative, status: 'MISSING' };
      throw error;
    }
    if (stat.isSymbolicLink()) return { path: relative, status: 'UNSAFE', reason: 'Symbolic links are not allowed for Token sources' };
    if (index < parts.length - 1 && !stat.isDirectory()) return { path: relative, status: 'UNSAFE', reason: 'A parent path is not a directory' };
    if (index === parts.length - 1 && !stat.isFile()) return { path: relative, status: 'UNSAFE', reason: 'Token source must be a regular file' };
  }
  return { path: relative, status: 'PASS' };
}

export async function resolveTokenSources(root, configured) {
  const wasConfigured = configured !== undefined && configured !== null;
  const raw = wasConfigured ? (Array.isArray(configured) ? configured : [configured]) : tokenCandidates;
  if (wasConfigured && (!raw.length || raw.some(value => typeof value !== 'string'))) {
    throw Error('context.tokens must be a workspace-relative path, a non-empty path array, or null');
  }
  const candidates = [...new Set(raw.map(normalizeRelative))];
  const results = [];
  for (const candidate of candidates) {
    const result = await inspect(root, candidate);
    if (!wasConfigured && result.status === 'MISSING') continue;
    results.push(result);
  }
  const sources = results.filter(result => result.status === 'PASS').map(result => result.path);
  const problems = results.filter(result => result.status !== 'PASS');
  return { configured: wasConfigured, discovered: !wasConfigured, sources, results, problems };
}

import {spawn} from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import {terminateProcessTree,windowsCommandPlan} from './run-command.mjs';
import {isUnsafeEnvironmentKey} from './env-safety.mjs';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const commandKey = value => (process.platform === 'win32' ? path.win32.basename(value) : path.basename(value)).toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/, '');

export function commandIsAllowed(command) {
  const configured = process.env.INSTAR_HOOK_ALLOWED_COMMANDS;
  if (configured === undefined) return true;
  const allowed = new Set(configured.split(',').map(value => commandKey(value.trim())).filter(Boolean));
  return allowed.has(commandKey(command));
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(error => error ? reject(error) : port ? resolve(port) : reject(Error('Unable to reserve a preview port')));
    });
  });
}

function replacePort(value, port) {
  return typeof value === 'string' ? value.replaceAll('{port}', String(port)) : value;
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const check = () => new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const request = (url.startsWith('https:') ? https : http).get(url, response => {
      response.resume();
      finish(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.setTimeout(Math.min(2000, timeoutMs), () => request.destroy());
    request.on('error', () => finish(false));
  });
  return (async () => {
    while (Date.now() < deadline) {
      if (await check()) return true;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
  })();
}

function stopProcess(child) {
  return terminateProcessTree(child);
}

export function validatePreviewRuntime(runtime) {
  if (runtime === undefined) return null;
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) throw Error('verification.runtime must be an object');
  if (typeof runtime.command !== 'string' || !runtime.command.trim() || runtime.command.length > 256 || runtime.command.includes('\0')) throw Error('verification.runtime.command must be a non-empty command');
  if (!commandIsAllowed(runtime.command)) {
    const error = Error('verification.runtime.command is not allowed by INSTAR_HOOK_ALLOWED_COMMANDS');
    error.code = 'EPREVIEWCOMMANDNOTALLOWED';
    throw error;
  }
  if (!Array.isArray(runtime.args) || runtime.args.length > 64 || runtime.args.some(value => typeof value !== 'string' || value.includes('\0') || Buffer.byteLength(value) > 2048)) throw Error('verification.runtime.args must be a string array');
  if (runtime.timeoutMs !== undefined && (!Number.isInteger(runtime.timeoutMs) || runtime.timeoutMs < 1000 || runtime.timeoutMs > 120000)) throw Error('verification.runtime.timeoutMs must be an integer between 1000 and 120000');
  let readyUrl = runtime.readyUrl ?? 'http://127.0.0.1:{port}/';
  if (typeof readyUrl !== 'string') throw Error('verification.runtime.readyUrl must be a string');
  let parsed;
  try { parsed = new URL(readyUrl.replace('{port}', '4173')); } catch { throw Error('verification.runtime.readyUrl must be an HTTP URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !LOOPBACK.has(parsed.hostname)) throw Error('verification.runtime.readyUrl must use a loopback host');
  if (runtime.env !== undefined && (!runtime.env || typeof runtime.env !== 'object' || Array.isArray(runtime.env) || Object.entries(runtime.env).some(([key, value]) => !/^[A-Z_][A-Z0-9_]*$/i.test(key) || isUnsafeEnvironmentKey(key) || typeof value !== 'string' || value.includes('\0') || Buffer.byteLength(value) > 2048))) throw Error('verification.runtime.env must contain safe string values; credential and process-loader variables are forbidden');
  return { ...runtime, args: [...runtime.args], readyUrl, timeoutMs: runtime.timeoutMs ?? 30000, env: { ...(runtime.env ?? {}) } };
}

export async function startPreviewRuntime(root, runtime, baseEnv) {
  const checked = validatePreviewRuntime(runtime);
  const port = await reservePort();
  const readyUrl = replacePort(checked.readyUrl, port);
  const env = {
    ...baseEnv,
    ...Object.fromEntries(Object.entries(checked.env).map(([key, value]) => [key, replacePort(value, port)])),
    PORT: String(port),
    INSTAR_BASE_URL: readyUrl,
    PLAYWRIGHT_BASE_URL: readyUrl,
    A11Y_BASE_URL: readyUrl,
    KEYBOARD_BASE_URL: readyUrl
  };
  const args = checked.args.map(value => replacePort(value, port));
  const launch=process.platform==='win32'?windowsCommandPlan(checked.command,args):{command:checked.command,args,shell:false};
  const child = spawn(launch.command, launch.args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true, shell:launch.shell===true });
  let output = '';
  const collect = chunk => { if (Buffer.byteLength(output) < 16384) output += chunk.toString('utf8').slice(0, 16384 - Buffer.byteLength(output)); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const exited = new Promise(resolve => {
    child.once('error', error => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const ready = await Promise.race([waitForHttp(readyUrl, checked.timeoutMs), exited.then(result => result)]);
  if (ready !== true) {
    await stopProcess(child);
    const detail = ready?.error?.message || ready?.code !== undefined ? `exit ${ready.code ?? ready.error?.message}` : 'readiness timeout';
    throw Error(`Preview runtime did not become ready at ${readyUrl} (${detail})${output.trim() ? `: ${output.trim()}` : ''}`);
  }
  return { port, baseUrl: readyUrl, pid: child.pid, stop: () => stopProcess(child) };
}

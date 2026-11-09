import { parse } from 'smol-toml';

export function parseProjectAgentConfig(text) {
  const parsed = parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Codex config must be a TOML table');
  if (parsed.agents !== undefined && (!parsed.agents || typeof parsed.agents !== 'object' || Array.isArray(parsed.agents))) throw Error('[agents] must be a TOML table');
  return parsed;
}

export function mergeAgentRegistrations(existingText, desired) {
  const parsed = parseProjectAgentConfig(existingText || '');
  const current = parsed.agents || {};
  const additions = [];
  const registered = [];
  const conflicts = [];
  for (const [name, registration] of Object.entries(desired)) {
    const currentRole = current[name];
    if (currentRole !== undefined) {
      if (currentRole && currentRole.config_file === registration.config_file) registered.push(name);
      else conflicts.push({ role: name, existing: currentRole?.config_file || null, expected: registration.config_file });
      continue;
    }
    additions.push(`[agents.${name}]\ndescription = ${JSON.stringify(registration.description)}\nconfig_file = ${JSON.stringify(registration.config_file)}\n`);
    registered.push(name);
  }
  let prefix = existingText || '';
  if (additions.length && prefix) {
    if (!prefix.endsWith('\n')) prefix += '\n';
    if (!prefix.endsWith('\n\n')) prefix += '\n';
  }
  const text = additions.length ? `${prefix}${additions.join('\n')}\n` : existingText;
  // Validate the exact merged output before allowing a write.
  parseProjectAgentConfig(text || '');
  return { text, registered, added: additions.length, conflicts };
}

function removeAgentTable(text, name) {
  const lines = text.split('\n');
  const header = new RegExp(`^\\[agents\\.${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\]\\s*(?:#.*)?$`);
  const start = lines.findIndex(line => header.test(line));
  if (start < 0) return text;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^\s*\[/.test(lines[index])) { end = index; break; }
  }
  const before = lines.slice(0, start);
  const after = lines.slice(end);
  while (before.length && !before[before.length - 1].trim()) before.pop();
  while (after.length && !after[0].trim()) after.shift();
  if (before.length && after.length) before.push('');
  return `${[...before, ...after].join('\n')}${text.endsWith('\n') ? '\n' : ''}`;
}

export function removeAgentRegistrations(existingText, roles, expected = {}) {
  const parsed = parseProjectAgentConfig(existingText || '');
  const current = parsed.agents || {};
  const removed = [], conflicts = [];
  let text = existingText || '';
  for (const name of roles) {
    const currentRole = current[name];
    if (currentRole === undefined) continue;
    const expectedFile = expected[name] || `agents/${name}.toml`;
    if (currentRole?.config_file !== expectedFile) {
      conflicts.push({ role: name, existing: currentRole?.config_file || null, expected: expectedFile });
      continue;
    }
    const next = removeAgentTable(text, name);
    if (next === text) {
      conflicts.push({ role: name, existing: currentRole?.config_file || null, expected: expectedFile, reason: 'Registration uses a TOML layout that cannot be removed safely; remove it manually' });
      continue;
    }
    text = next;
    removed.push(name);
  }
  parseProjectAgentConfig(text || '');
  return { text, removed, conflicts };
}

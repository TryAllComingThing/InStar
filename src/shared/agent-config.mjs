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

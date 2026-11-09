import {readFile, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert(match, 'SKILL.md must start with YAML frontmatter');
  const raw = match[1];
  const fields = {};
  const lines = raw.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const field = lines[index].match(/^([a-z][a-z0-9-]*):\s*(.*)$/);
    if (!field) continue;
    const [, key, value] = field;
    if (value === '' || /^[>|][-+]?$/.test(value)) {
      const parts = [];
      let next = index + 1;
      while (next < lines.length && (/^\s+/.test(lines[next]) || lines[next] === '')) {
        if (lines[next].trim()) parts.push(lines[next].trim());
        next += 1;
      }
      fields[key] = parts.join(' ');
      index = next - 1;
    } else {
      fields[key] = value.trim();
    }
  }
  return {fields, raw, body: text.slice(match[0].length)};
}

function markdownLinks(text, file) {
  const links = [];
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    target = target.split('#')[0].trim();
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target)) continue;
    links.push({target, file: path.resolve(path.dirname(file), target)});
  }
  return links;
}

async function resourceFiles(root) {
  const files = [];
  for (const directory of ['references', 'assets', 'scripts']) {
    async function walk(relative) {
      let entries;
      try {
        entries = await readdir(path.join(root, relative), {withFileTypes: true});
      } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
      }
      for (const entry of entries) {
        if (entry.name === '.DS_Store') continue;
        const next = `${relative}/${entry.name}`;
        if (entry.isDirectory()) await walk(next);
        else if (entry.isFile()) files.push(next);
      }
    }
    await walk(directory);
  }
  return files;
}

export async function validateSkills(skillsDir, {pluginRoot = path.dirname(skillsDir)} = {}) {
  const entries = await readdir(skillsDir, {withFileTypes: true});
  const names = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const descriptions = new Map();
  const resolvedPluginRoot = path.resolve(pluginRoot);
  for (const name of names) {
    const root = path.resolve(skillsDir, name);
    const file = path.join(root, 'SKILL.md');
    const text = await readFile(file, 'utf8');
    const parsed = frontmatter(text);
    assert.equal(parsed.fields.name, name, `${name}: frontmatter name must match directory`);
    assert.match(parsed.fields.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${name}: invalid skill name`);
    assert(parsed.fields.name.length <= 64, `${name}: name exceeds 64 characters`);
    assert(parsed.fields.description, `${name}: description is required`);
    assert(parsed.fields.description.length <= 1024, `${name}: description exceeds 1024 characters`);
    if (parsed.fields.compatibility) assert(parsed.fields.compatibility.length <= 500, `${name}: compatibility exceeds 500 characters`);
    const rawLines = parsed.raw.split('\n');
    const allowedIndex = rawLines.findIndex(line => /^allowed-tools:/.test(line));
    if (allowedIndex >= 0) assert(!/^\s+-/.test(rawLines[allowedIndex + 1] || ''), `${name}: allowed-tools must be a space-separated string, not a YAML list`);
    assert(parsed.body.split('\n').length <= 500, `${name}: SKILL.md body exceeds 500 lines`);
    const children = await readdir(root, {withFileTypes: true});
    for (const child of children) {
      if (child.isDirectory()) assert(['references', 'assets', 'scripts'].includes(child.name), `${name}: unsupported L3 directory ${child.name}; use references/, assets/, or scripts/`);
    }
    const visited = new Map();
    async function collectMarkdown(current) {
      if (visited.has(current)) return;
      const content = await readFile(current, 'utf8');
      visited.set(current, content);
      for (const link of markdownLinks(content, current)) {
        assert(link.file === resolvedPluginRoot || link.file.startsWith(`${resolvedPluginRoot}${path.sep}`), `${name}: link escapes the plugin root: ${link.target}`);
        let info;
        try {
          info = await stat(link.file);
        } catch {
          assert.fail(`${name}: link target does not exist: ${link.target}`);
        }
        if (info.isFile() && link.file.endsWith('.md') && link.file.startsWith(`${root}${path.sep}`)) await collectMarkdown(link.file);
      }
    }
    await collectMarkdown(file);
    const linked = new Set();
    for (const [markdownFile, content] of visited) {
      for (const link of markdownLinks(content, markdownFile)) {
        if (link.file.startsWith(`${root}${path.sep}`)) linked.add(path.relative(root, link.file).split(path.sep).join('/'));
      }
    }
    const unreferenced = (await resourceFiles(root)).filter(resource => !linked.has(resource));
    assert.deepEqual(unreferenced, [], `${name}: resource files must be reachable from SKILL.md links: ${unreferenced.join(', ')}`);
    descriptions.set(name, parsed.fields.description);
  }
  const duplicates = [...descriptions.entries()].filter(([name, description]) => [...descriptions.entries()].some(([other, value]) => other !== name && value === description));
  assert.equal(duplicates.length, 0, `duplicate Skill descriptions: ${duplicates.map(([name]) => name).join(', ')}`);
  return {names, descriptions};
}

export async function fileExists(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

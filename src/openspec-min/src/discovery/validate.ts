// InStar baseline-discovery adapter over OpenSpec's MIT-licensed parser,
// main-spec structural checks and schemas. See ../../LICENSE.
import { MarkdownParser } from '../diff/parsers/markdown-parser.js';
import { findMainSpecStructureIssues, stripFencedCodeBlocksPreservingLines } from '../diff/parsers/spec-structure.js';
import { containsShallOrMust, extractRequirementBody } from '../diff/parsers/requirement-text.js';
import { SpecSchema } from '../engine/artifacts/spec.schema.js';

export function normalizeDiscoveredSpec(document: string) {
  return document.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ''));
}

export function assertUniqueSpecNames(spec: {requirements: {name?: string; scenarios: {name?: string}[]}[]}) {
  const requirements = new Set<string>();
  for (const requirement of spec.requirements) {
    const name=(requirement.name??'').trim().replace(/\s+/g,' ').toLowerCase();
    if (!name || requirements.has(name)) throw new Error(`Duplicate or empty requirement name: ${requirement.name??''}`);
    requirements.add(name);
    const scenarios = new Set<string>();
    for (const scenario of requirement.scenarios) {
      const scenarioName=(scenario.name??'').trim().replace(/\s+/g,' ').toLowerCase();
      if (!scenarioName || scenarios.has(scenarioName)) throw new Error(`${requirement.name}: duplicate or empty scenario name: ${scenario.name??''}`);
      scenarios.add(scenarioName);
    }
  }
  return spec;
}

/** Validate a current-state baseline, not an ADDED/MODIFIED change delta. */
export function validateDiscoveredSpec(name: string, document: string) {
  const normalized = document.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  // Parsing the saved Markdown with OpenSpec does not ignore HTML comments.
  // Reject Markdown structure hidden in comments, then normalize comments once
  // so validation and downstream parsing see the same document.
  for (const match of normalized.matchAll(/<!--[\s\S]*?-->/g)) {
    if (/(?:^|\n)\s{0,3}#{1,6}\s+/.test(match[0].slice(4,-3))) throw new Error('HTML comments cannot contain Markdown headings in a discovered spec');
  }
  const text = normalizeDiscoveredSpec(normalized);
  const issues = findMainSpecStructureIssues(text);
  if (issues.length) throw new Error(issues.map(issue => issue.message).join('\n'));
  const visible = stripFencedCodeBlocksPreservingLines(text);
  for (const section of ['Purpose', 'Requirements']) {
    if ((visible.match(new RegExp(`^## ${section}\\s*$`, 'gm')) || []).length !== 1) {
      throw new Error(`Exactly one ## ${section} section is required`);
    }
  }
  const body = visible.split(/^## Requirements\s*$/m)[1].split(/^## /m)[0];
  if (/^### (?!Requirement: )/m.test(body) || /^#### (?!Scenario: )/m.test(body)) {
    throw new Error('Use ### Requirement: and #### Scenario: headings');
  }
  const spec = assertUniqueSpecNames(SpecSchema.parse(new MarkdownParser(text).parseSpec(name)));
  const blocks = body.split(/^### Requirement:\s*.+$/m).slice(1);
  if (blocks.length !== spec.requirements.length) throw new Error('Unrecognized requirement structure');
  for (const [index, block] of blocks.entries()) {
    if (!containsShallOrMust(extractRequirementBody(block.split('\n')))) {
      throw new Error(`${spec.requirements[index].name}: requirement body needs SHALL or MUST`);
    }
    const scenarios = block.split(/^#### Scenario:\s*\S.*$/m).slice(1);
    if (!scenarios.length || scenarios.some(scenario => !/\bWHEN\b/.test(scenario) || !/\bTHEN\b/.test(scenario))) {
      throw new Error(`${spec.requirements[index].name}: every scenario needs WHEN and THEN`);
    }
  }
  return spec;
}

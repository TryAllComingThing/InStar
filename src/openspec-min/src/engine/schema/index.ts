import { readFileSync } from 'node:fs';

function authoring(skill: string, templates: string[]): string {
  const base = new URL(`../../skills/${skill}/`, import.meta.url);
  const rules = readFileSync(new URL('references/authoring.md', base), 'utf8');
  const assets = templates.map(name =>
    `## ${name}.md template\n\n${readFileSync(new URL(`assets/${name}.md`, base), 'utf8')}`
  ).join('\n\n');
  return `${rules}\n\n${assets}`;
}

// These are generation instructions, not the orchestrator SKILL workflow:
// callbacks return documents and must not recursively invoke lifecycle APIs.
export const instructions = {
  propose: `${authoring('propose', ['proposal', 'spec'])}\nReturn {proposal: string, specs: Record<string, string>}; specs keys are capability paths. Use the supplied PRD, full baseline documents, and projectArchitecture. Apply only rules present in the project context; do not assume a framework architecture such as FSD. Carry relevant architecture constraints into the proposal/spec rationale where they affect the requirements. Return documentation only; do not call lifecycle APIs or write files inside the callback.`,
  design: `${authoring('design', ['technical-design'])}\nUse the supplied proposal, delta specs, baseline, and projectArchitecture (guidance, standards, projectTree). Obey applicable AGENTS.md directory rules and architecture constraints; plan implementation files within the existing project layout and explain any exception. If treeTruncated, standardsTruncated, or guidanceTruncated is true, inspect the relevant source files before finalizing. The Architecture section must distinguish project rules from decisions made for this change. Return the complete technical design Markdown string only; do not call lifecycle APIs or write files inside the callback.`,
  tasks: `${authoring('tasks', ['tasks'])}\nUse the supplied specs, baseline, and technicalDesign. Return the complete tasks Markdown string only; do not call lifecycle APIs or write files inside the callback.`,
} as const;

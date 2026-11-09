/**
 * Shared, fence-aware requirement-reading helpers.
 *
 * The requirement reader used to be implemented twice — once for main specs
 * (`MarkdownParser.parseRequirements`) and once for change deltas
 * (`Validator.extractRequirementText`) — and the two drifted apart. These
 * helpers are the single source of truth for requirement-body extraction and
 * `SHALL`/`MUST` detection in `validate <change>`, `validate <spec>`, and
 * `archive`.
 */

// Re-exported so existing importers keep working; the single implementation
// lives in code-fence.ts.
export { buildCodeFenceMask } from './code-fence.js';
import { buildCodeFenceMask } from './code-fence.js';

/** Lines that look like `**ID**: ...` / `**Priority**: ...` metadata. */
const METADATA_LINE = /^\*\*[^*]+\*\*:/;

/** Any markdown header line — the boundary where a requirement body ends. */
const HEADER_LINE = /^#{1,6}\s/;

/** Any level-4 heading, used only to diagnose non-canonical children. */
export const LEVEL_FOUR_HEADER = /^####[ \t]+/;

/**
 * The one canonical scenario heading. A `#### Edge case` is not a scenario;
 * accepting it as one made gate, parser and discovery disagree about what the
 * document meant. A header alone is not yet a scenario: see hasScenarioBody.
 */
export const SCENARIO_HEADER = /^####[ \t]+Scenario:[ \t]*\S/;

/** Whether a header title (without its leading markers) is a scenario title. */
export function isScenarioTitle(title: string): boolean {
  return /^Scenario:[ \t]*\S/.test(title);
}

/**
 * Whether a scenario's body has content. The spec path
 * (`MarkdownParser.parseScenarios`) drops a scenario whose body is empty, so
 * the delta counter must too (parity): otherwise `validate` accepts a
 * requirement whose only scenario is a bare header, and archive rejects it when
 * it validates the rebuilt spec.
 */
export function hasScenarioBody(body: string): boolean {
  return body.trim().length > 0;
}

/**
 * The one predicate for normative-keyword detection. Matches `SHALL` or `MUST`
 * as whole words so the change-delta reader and the schema-based reader accept
 * and reject identical text.
 */
export function containsShallOrMust(text: string): boolean {
  return /\b(SHALL|MUST)\b/.test(text);
}

/**
 * Extract the full requirement body from the lines that follow a
 * `### Requirement:` header (the lines may include scenarios and fenced code).
 *
 * Captures every body line from the start up to the first header found on a
 * non-fenced line — usually the first `#### Scenario:`, but also a stray `###`
 * divider the delta reader absorbed into the block — skipping blank lines and
 * any line inside a fenced code block. `**metadata**:` lines are skipped only
 * when other body text remains: a requirement written entirely as
 * `**Constraint**: The system MUST ...` keeps that line as its body. Captured
 * lines are trimmed and joined with newlines so a requirement whose text wraps
 * across lines — or whose `SHALL`/`MUST` lands on a later line — is read in
 * full.
 */
export function extractRequirementBody(bodyLines: string[]): string {
  const mask = buildCodeFenceMask(bodyLines);
  const captured: string[] = [];
  const metadata: string[] = [];

  for (let i = 0; i < bodyLines.length; i++) {
    if (mask[i]) continue; // inside a fenced code block
    const line = bodyLines[i];
    if (HEADER_LINE.test(line)) break; // first scenario or stray divider
    const trimmed = line.trim();
    if (trimmed.length === 0) continue; // blank
    if (METADATA_LINE.test(trimmed)) {
      metadata.push(trimmed); // **ID**: / **Priority**: ...
      continue;
    }
    captured.push(trimmed);
  }

  if (captured.length > 0) return captured.join('\n');
  return metadata.join('\n'); // metadata-only body: the metadata IS the body
}

/**
 * Parser/display fallback for a requirement block with no body text. This is
 * what lets a bare `### The system SHALL ...` header remain readable on the
 * spec path (the title is the requirement). Validator body-keyword checks for
 * canonical `### Requirement:` blocks use `extractRequirementBody` directly so
 * a keyword that appears only in the header still receives the #1156/#1280
 * body-keyword hint.
 */
export function extractRequirementText(headerTitle: string, bodyLines: string[]): string {
  return extractRequirementBody(bodyLines) || headerTitle.trim();
}

/**
 * Line-ending helpers.
 *
 * Every parser in this codebase normalizes CRLF to LF on the way in, so all
 * serialization logic can assume '\n'. That leaves the write side responsible
 * for restoring whatever convention the file already used: without it, editing
 * one requirement in a CRLF spec rewrites every line of the file and buries the
 * real change in the diff.
 */

type LineEnding = '\n' | '\r\n' | '\r';

/**
 * The dominant line ending in `content`, or undefined when it holds no line
 * break to judge from.
 *
 * Mixed files resolve to whichever ending is more common, with CRLF winning a
 * tie: a file that is mostly CRLF is a CRLF file that picked up a stray LF, and
 * settling the whole file on one ending is what keeps later diffs small.
 */
function detectLineEnding(content: string): LineEnding | undefined {
  const crlf = content.match(/\r\n/g)?.length ?? 0;
  // Count LFs not preceded by CR, so CRLF is never also counted as LF.
  const lf = content.match(/(?<!\r)\n/g)?.length ?? 0;
  // Classic-Mac files use a bare CR. It must be counted separately from CRLF.
  const cr = content.replace(/\r\n/g, '').match(/\r/g)?.length ?? 0;

  if (crlf === 0 && lf === 0 && cr === 0) return undefined;
  if (crlf >= lf && crlf >= cr) return '\r\n';
  if (cr >= lf) return '\r';
  return '\n';
}

/**
 * Re-apply `ending` to LF-normalized `content`.
 *
 * Normalizes to LF first, so the result is uniform even if the caller passed
 * content that already contained CRLF.
 */
function applyLineEnding(content: string, ending: LineEnding): string {
  const normalized = content.replace(/\r\n?/g, '\n');
  if (ending === '\n') return normalized;
  return normalized.replace(/\n/g, ending);
}

/**
 * Rewrite `content` to match the convention of `original`.
 *
 * When `original` has no line break to learn from, `content` is left as LF —
 * the portable default this project writes new files with.
 */
export function matchLineEnding(content: string, original: string): string {
  const ending = detectLineEnding(original);
  const body = ending === undefined ? content : applyLineEnding(content, ending);
  // Readers strip the UTF-8 BOM so headers match. Writes must put it back or a
  // byte-level diff rewrites the first line even when nothing changed.
  return original.startsWith('\uFEFF') && !body.startsWith('\uFEFF') ? `\uFEFF${body}` : body;
}

/**
 * Pre-parse normalizer for `pymdownx.smartsymbols`.
 *
 * Material's smart-symbols extension converts ASCII shortcuts into the
 * corresponding Unicode glyphs:
 *
 *   (c)   → ©    (r)   → ®    (tm)  → ™
 *   c/o   → ℅    +/-   → ±    =/=   → ≠
 *   -->   → →    <--   → ←    <-->  → ↔
 *   1/2 1/4 3/4 1/3 2/3 1/8 3/8 5/8 7/8 → ½ ¼ ¾ ⅓ ⅔ ⅛ ⅜ ⅝ ⅞
 *
 * No remark/rehype plugin ships with Astro for this, so we expand the
 * shortcuts at the text-normalization stage. Substitutions are unambiguous
 * (none of the shortcuts overlap with CommonMark syntax) and are applied
 * line-by-line in a single pass.
 *
 * Idempotency: substitutions output Unicode glyphs that no longer match the
 * source patterns, so a second pass finds nothing to rewrite.
 *
 * Fenced-code safety: lines inside ` ``` ` are passed through verbatim;
 * inline backtick spans are also shielded so `\`(c)\`` stays literal.
 */

const FENCE = /^ {0,3}(```|~~~)/;

interface Substitution {
  readonly pattern: RegExp;
  readonly replacement: string;
}

// Order matters: longer arrows first so `<-->` is matched before `<--`.
//
// Arrows require whitespace/start/end on both sides so the rewriter does NOT
// consume `<--` and `-->` inside `--8<--` snippet markers (which sit
// flush against digits and dashes).
const SUBSTITUTIONS: ReadonlyArray<Substitution> = [
  // Arrows (longest first)
  { pattern: /(?<=^|\s)<-->(?=\s|$)/g, replacement: '↔' },
  { pattern: /(?<=^|\s)-->(?=\s|$)/g, replacement: '→' },
  { pattern: /(?<=^|\s)<--(?=\s|$)/g, replacement: '←' },
  // Lettered marks
  { pattern: /\(c\)/g, replacement: '©' },
  { pattern: /\(r\)/g, replacement: '®' },
  { pattern: /\(tm\)/g, replacement: '™' },
  // Math/care-of
  { pattern: /\+\/-/g, replacement: '±' },
  { pattern: /=\/=/g, replacement: '≠' },
  { pattern: /\bc\/o\b/g, replacement: '℅' },
  // Fractions (whole-word only — `\b` boundaries prevent eating segments of
  // longer numbers like `11/22`)
  { pattern: /\b1\/2\b/g, replacement: '½' },
  { pattern: /\b1\/3\b/g, replacement: '⅓' },
  { pattern: /\b2\/3\b/g, replacement: '⅔' },
  { pattern: /\b1\/4\b/g, replacement: '¼' },
  { pattern: /\b3\/4\b/g, replacement: '¾' },
  { pattern: /\b1\/8\b/g, replacement: '⅛' },
  { pattern: /\b3\/8\b/g, replacement: '⅜' },
  { pattern: /\b5\/8\b/g, replacement: '⅝' },
  { pattern: /\b7\/8\b/g, replacement: '⅞' },
];

export function normalizeSmartSymbols(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) {
      output.push(line);
      inFence = !inFence;
      continue;
    }
    output.push(inFence ? line : rewriteLine(line));
  }
  return output.join('\n');
}

function rewriteLine(line: string): string {
  return splitOutOfBackticks(line, rewriteSegment).join('');
}

function rewriteSegment(segment: string): string {
  let out = segment;
  for (const { pattern, replacement } of SUBSTITUTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function splitOutOfBackticks(
  line: string,
  rewriter: (segment: string) => string,
): ReadonlyArray<string> {
  const out: string[] = [];
  let i = 0;
  let buffer = '';
  while (i < line.length) {
    if (line[i] === '`') {
      if (buffer.length > 0) {
        out.push(rewriter(buffer));
        buffer = '';
      }
      const end = findBacktickClose(line, i);
      if (end === -1) {
        buffer += line.slice(i);
        i = line.length;
        continue;
      }
      out.push(line.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    buffer += line[i];
    i += 1;
  }
  if (buffer.length > 0) {
    out.push(rewriter(buffer));
  }
  return out;
}

function findBacktickClose(line: string, openIndex: number): number {
  for (let j = openIndex + 1; j < line.length; j += 1) {
    if (line[j] === '`') {
      return j;
    }
  }
  return -1;
}

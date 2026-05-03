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
  // Mask HTML comment spans before applying substitutions so that `-->`
  // inside `<!-- ... -->` is never rewritten as an arrow. We split the line
  // into [outside-comment, comment, outside-comment, ...] segments and only
  // rewrite the outside parts.
  return splitOutOfHtmlComments(line, (seg) =>
    splitOutOfBackticks(seg, rewriteSegment).join(''),
  ).join('');
}

/**
 * Split a line around HTML comment spans (`<!-- ... -->`), applying
 * `rewriter` only to the non-comment portions and returning comment spans
 * verbatim. A single line may contain at most one HTML comment span (the
 * common case for MkDocs marker comments like `<!-- only-mkdocs -->`).
 */
function splitOutOfHtmlComments(
  line: string,
  rewriter: (segment: string) => string,
): ReadonlyArray<string> {
  const out: string[] = [];
  let cursor = 0;
  const COMMENT_START = '<!--';
  const COMMENT_END = '-->';
  let start = line.indexOf(COMMENT_START, cursor);
  while (start !== -1) {
    // Process text before the comment opener.
    if (start > cursor) {
      out.push(rewriter(line.slice(cursor, start)));
    }
    const end = line.indexOf(COMMENT_END, start + COMMENT_START.length);
    if (end === -1) {
      // Unclosed comment — treat the rest of the line as a comment (verbatim).
      out.push(line.slice(start));
      cursor = line.length;
      break;
    }
    // Include the full comment span verbatim.
    out.push(line.slice(start, end + COMMENT_END.length));
    cursor = end + COMMENT_END.length;
    start = line.indexOf(COMMENT_START, cursor);
  }
  // Any remaining text after the last comment.
  if (cursor < line.length) {
    out.push(rewriter(line.slice(cursor)));
  }
  return out;
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

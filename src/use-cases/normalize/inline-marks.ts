/**
 * Pre-parse normalizer for the inline PyMdown extensions: `==mark==`,
 * `~sub~`, `^sup^`, and `++keys++`.
 *
 * Each extension translates into a small chunk of HTML that flows through the
 * downstream Markdown pipeline as a raw `html` node:
 *
 *   ==text==                 → <mark>text</mark>
 *   H~2~O                    → H<sub>2</sub>O
 *   2^10^                    → 2<sup>10</sup>
 *   ++ctrl+alt+del++         → <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd>
 *
 * Pure: takes a string, returns a string. Fence-shielded (` ``` `) and
 * inline-code-shielded (`` ` ``). Idempotent — the output contains HTML tags,
 * not the source markers, so the second pass finds nothing to rewrite.
 *
 * The four patterns are applied in a fixed order on each non-code segment;
 * within a segment they operate on disjoint character classes (`=`, `~`, `^`,
 * `+`) so they commute. Order is therefore stable but not load-bearing.
 */

const FENCE = /^ {0,3}(```|~~~)/;
const MATH_FENCE = /^ {0,3}\$\$\s*$/;

const MARK_RE = /==(?=\S)([^=\s][^=]*[^=\s]|[^=\s])==/g;
const SUB_RE = /~(?=\S)([^~\s][^~]*[^~\s]|[^~\s])~/g;
const SUP_RE = /\^(?=\S)([^\^\s][^\^]*[^\^\s]|[^\^\s])\^/g;
const KEYS_RE = /\+\+([A-Za-z0-9-]+(?:\+[A-Za-z0-9-]+)*)\+\+/g;

export function normalizeInlineMarks(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  let inMathBlock = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      output.push(line);
      inFence = !inFence;
      continue;
    }
    if (!inFence && MATH_FENCE.test(line)) {
      // `$$` on its own line opens or closes a `pymdownx.arithmatex` block-
      // math span. Body lines look like LaTeX (`\sum_{k=0}^{\infty}`) and
      // would otherwise collide with this normalizer's `^...^` superscript
      // and `~...~` subscript matchers, mangling math output. Shield the
      // block the same way fenced-code blocks are shielded.
      output.push(line);
      inMathBlock = !inMathBlock;
      continue;
    }
    if (inFence || inMathBlock) {
      output.push(line);
      continue;
    }
    output.push(rewriteLine(line));
  }
  return output.join('\n');
}

function rewriteLine(line: string): string {
  return splitOutOfBackticks(line, rewriteSegment).join('');
}

function rewriteSegment(segment: string): string {
  let out = segment;
  out = out.replace(MARK_RE, (_match, body: string) => `<mark>${body}</mark>`);
  out = out.replace(SUB_RE, (_match, body: string) => `<sub>${body}</sub>`);
  out = out.replace(SUP_RE, (_match, body: string) => `<sup>${body}</sup>`);
  out = out.replace(KEYS_RE, (_match, body: string) =>
    body
      .split('+')
      .map((token) => `<kbd>${titleCase(token)}</kbd>`)
      .join('+'),
  );
  return out;
}

function titleCase(token: string): string {
  if (token.length === 0) {
    return token;
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
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

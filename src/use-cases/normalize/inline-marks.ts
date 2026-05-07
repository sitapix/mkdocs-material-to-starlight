/**
 * Pre-parse normalizer for inline PyMdown extensions: `==mark==`, `~sub~`,
 * `^sup^`, `^^insert^^`, `++keys++`.
 *
 *   ==text==          → <mark>text</mark>
 *   H~2~O             → H<sub>2</sub>O
 *   2^10^             → 2<sup>10</sup>
 *   ^^Insert^^        → <ins>Insert</ins>
 *   ++ctrl+alt+del++  → <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd>
 *
 * Pure, fence-shielded, inline-code-shielded, idempotent.
 *
 * Order: `^^...^^` must match before `^...^`. Otherwise the inner
 * `^Insert^` consumes the markers and leaves stray `^`s.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const MATH_FENCE = /^ {0,3}\$\$\s*$/;

const MARK_RE = /==(?=\S)([^=\s][^=]*[^=\s]|[^=\s])==/g;
const SUB_RE = /~(?=\S)([^~\s][^~]*[^~\s]|[^~\s])~/g;
// Double-caret `pymdownx.caret` insert form. Must run before SUP_RE so the
// outer `^^` wins. Body cannot contain `^^` (no nesting).
const INS_RE = /\^\^(?=\S)([^\s][^^]*[^\s]|[^\s^])\^\^/g;
const SUP_RE = /\^(?=\S)([^^\s][^^]*[^^\s]|[^^\s])\^/g;
const KEYS_RE = /\+\+([A-Za-z0-9-]+(?:\+[A-Za-z0-9-]+)*)\+\+/g;

export function normalizeInlineMarks(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  let inMathBlock = false;
  for (const line of lines) {
    if (isFenceLine(line)) {
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
  // INS before SUP — `^^Insert^^` must produce `<ins>Insert</ins>`, not the
  // single-caret form's accidental `^<sup>Insert</sup>^`.
  out = out.replace(INS_RE, (_match, body: string) => `<ins>${body}</ins>`);
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

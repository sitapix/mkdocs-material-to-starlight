/**
 * Pre-parse normalizer: insert blank lines around standalone HTML-block tags.
 *
 * CommonMark §4.6: a type-6 HTML block consumes every following non-blank
 * line as raw HTML until a blank line terminates it. So
 *
 *   <div style="…">
 *   [Download :material-windows:](url)
 *   </div>
 *
 * collapses into one opaque block. The inner link never enters the AST and
 * downstream transforms miss it (DDEV install Step 2 regressed this way).
 *
 * Behaviour: a line that is exactly one HTML start tag gets a blank line
 * after; exactly one close tag gets a blank line before. Void elements
 * (`<br>`, `<hr>`) and fenced-code interiors pass through. Idempotent: a
 * second pass duplicates nothing.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

// A line that is JUST an opening or closing HTML or JSX block tag.
//
// Lowercase HTML elements (`<div>`) match both openers and closers with
// 0–3 leading spaces (CommonMark §4.6 HTML-block rule).
//
// PascalCase MDX components (`<Tip>`, `<Card>`) match ONLY closers and
// ONLY at column zero. The bug this guards against is Mintlify-style
// wrappers (`<Tip>...</Tip>` around multi-paragraph prose): if the
// closer sits on its own line directly after prose, remark glues it
// onto the paragraph and MDX errors with "Expected the closing tag
// `</Tip>` … before the end of paragraph". Padding only the closer is
// the minimum fix.
//
// Restricting PascalCase to closers-at-col-0 deliberately excludes
// nested-component patterns like `<TabItem>` inside `<Tabs>` — padding
// those would either insert blank lines between an outer opener and
// inner opener (re-promoting following indented body to a fenced code
// block, breaking idempotency) or duplicate work the converter's own
// stringifier already does for generated JSX.
//
// Attribute matching is intentionally loose — anything except `>`.
const STANDALONE_OPEN_TAG_RE = /^ {0,3}<([a-z][a-z0-9-]*)\b[^>]*>\s*$/;
const STANDALONE_CLOSE_TAG_LC_RE = /^ {0,3}<\/([a-z][a-z0-9-]*)\s*>\s*$/;
const STANDALONE_CLOSE_TAG_PC_RE = /^<\/([A-Z][A-Za-z0-9-]*)\s*>\s*$/;

// Self-closing void elements per the WHATWG spec — these don't open blocks
// and don't need padding.
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export function normalizeHtmlBlockSpacing(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isFenceLine(line)) {
      out.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const openMatch = line.match(STANDALONE_OPEN_TAG_RE);
    if (openMatch !== null && !VOID_ELEMENTS.has((openMatch[1] ?? '').toLowerCase())) {
      // Pad BEFORE this opener if the previous emitted line is non-blank.
      const previous = out[out.length - 1];
      if (previous !== undefined && previous.trim().length > 0) {
        out.push('');
      }
      out.push(line);
      // Pad AFTER if the next line is non-blank.
      const next = lines[i + 1];
      if (next !== undefined && next.trim().length > 0) {
        out.push('');
      }
      continue;
    }
    const closeMatchLc = line.match(STANDALONE_CLOSE_TAG_LC_RE);
    const closeMatchPc = closeMatchLc === null ? line.match(STANDALONE_CLOSE_TAG_PC_RE) : null;
    if (closeMatchLc !== null || closeMatchPc !== null) {
      const previous = out[out.length - 1];
      // For PascalCase closers, only pad when the previous line is prose
      // (the bug case is `</Tip>` after a glued paragraph). Skip padding
      // when the previous line is itself a JSX/HTML tag — converter-emitted
      // `<Tabs>...</TabItem>\n</Tabs>` is already block-structured, and
      // padding here would break pipeline idempotency on re-conversion.
      const isPascalCloser = closeMatchPc !== null;
      const prevIsTag =
        previous !== undefined && /^\s*<\/?[A-Za-z][A-Za-z0-9-]*\b[^>]*>\s*$/.test(previous);
      const shouldPadBefore =
        previous !== undefined && previous.trim().length > 0 && !(isPascalCloser && prevIsTag);
      if (shouldPadBefore) {
        out.push('');
      }
      out.push(line);
      const next = lines[i + 1];
      // Same shape for the after-pad: PascalCase closer followed by another
      // tag is already block-structured.
      const nextIsTag =
        next !== undefined && /^\s*<\/?[A-Za-z][A-Za-z0-9-]*\b[^>]*>\s*$/.test(next);
      const shouldPadAfter =
        next !== undefined && next.trim().length > 0 && !(isPascalCloser && nextIsTag);
      if (shouldPadAfter) {
        out.push('');
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

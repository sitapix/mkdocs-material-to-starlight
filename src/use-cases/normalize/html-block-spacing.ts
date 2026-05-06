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

// A line that is JUST an opening or closing HTML block tag. The tag name is
// constrained to lowercase letters/digits/hyphens (matches HTML element naming
// rules). Attribute matching is intentionally loose — anything except `>`.
const STANDALONE_OPEN_TAG_RE = /^\s*<([a-z][a-z0-9-]*)\b[^>]*>\s*$/;
const STANDALONE_CLOSE_TAG_RE = /^\s*<\/([a-z][a-z0-9-]*)\s*>\s*$/;

// Self-closing void elements per the WHATWG spec — these don't open blocks
// and don't need padding.
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
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
    const closeMatch = line.match(STANDALONE_CLOSE_TAG_RE);
    if (closeMatch !== null) {
      const previous = out[out.length - 1];
      if (previous !== undefined && previous.trim().length > 0) {
        out.push('');
      }
      out.push(line);
      const next = lines[i + 1];
      if (next !== undefined && next.trim().length > 0) {
        out.push('');
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

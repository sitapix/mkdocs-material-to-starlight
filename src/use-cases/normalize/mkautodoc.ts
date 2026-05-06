/**
 * Pre-parse normalizer: wrap mkautodoc-style `:::` blocks in a fenced code
 * block so they round-trip through remark-stringify.
 *
 * mkautodoc uses:
 *
 *   ::: httpx.request
 *       :docstring:
 *
 * The `:::` opener has no closer; the body is delimited by indentation.
 * remark-directive treats the `:::` as a directive opener, fails to find a
 * closer, and remark-stringify escapes the tokens to `\:::` and `\:` on the
 * next round-trip.
 *
 * Fix: wrap the `:::` line plus its indented body in a fenced code block.
 * The lookahead on "next non-blank line indented 4+ spaces" distinguishes
 * mkautodoc from a real Starlight aside (`:::name\n  body\n:::`).
 *
 * Idempotent: the wrapped output is fenced; existing fences pass through.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const MKAUTODOC_OPENER = /^:::\s+\S+/;
const INDENTED_LINE = /^ {4,}\S/;

export function normalizeMkautodocBlocks(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isFenceLine(line)) {
      out.push(line);
      inFence = !inFence;
      i += 1;
      continue;
    }
    if (inFence) {
      out.push(line);
      i += 1;
      continue;
    }
    if (!MKAUTODOC_OPENER.test(line)) {
      out.push(line);
      i += 1;
      continue;
    }
    const bodyEnd = scanBodyEnd(lines, i + 1);
    if (bodyEnd === null) {
      // No indented body — bare `::: identifier` line. Wrap just the opener
      // so remark-stringify does not escape it to \:::. This covers mkdocstrings
      // directives that carry no inline options (pydantic regression).
      out.push('```text');
      out.push(line);
      out.push('```');
      i += 1;
      continue;
    }
    out.push('```text');
    for (let k = i; k <= bodyEnd; k += 1) {
      out.push(lines[k] ?? '');
    }
    out.push('```');
    i = bodyEnd + 1;
  }
  return out.join('\n');
}

function scanBodyEnd(
  lines: ReadonlyArray<string>,
  startIndex: number,
): number | null {
  let lastIndentedLine: number | null = null;
  let j = startIndex;
  let sawAnyIndented = false;
  while (j < lines.length) {
    const peek = lines[j] ?? '';
    if (peek === '') {
      j += 1;
      continue;
    }
    if (INDENTED_LINE.test(peek)) {
      sawAnyIndented = true;
      lastIndentedLine = j;
      j += 1;
      continue;
    }
    break;
  }
  if (!sawAnyIndented) {
    return null;
  }
  return lastIndentedLine;
}

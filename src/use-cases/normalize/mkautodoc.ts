/**
 * Pre-parse normalizer: wrap mkautodoc-style `:::` blocks in fenced code so
 * they round-trip cleanly through remark-stringify.
 *
 * mkautodoc (and similar single-marker docstring extensions) use:
 *
 *   ::: httpx.request
 *       :docstring:
 *       :members:
 *
 * The `:::` opener has no matching closing `:::` — the body is delimited
 * solely by indentation. Without this normalizer, remark-directive sees the
 * `:::` line as a directive opener, fails to find a closer, and leaves the
 * tokens as a paragraph. remark-stringify then defensively escapes the
 * `:::` and `:identifier:` to prevent re-parsing as a directive on the next
 * round-trip — producing `\:::` and `\:` gibberish in the output.
 *
 * The cleanest fix is to take the entire mkautodoc block (the `:::` line
 * plus all following indented content) and wrap it in a fenced code block.
 * That preserves the original syntax verbatim for the human reader, gives
 * them a recognizable marker for "this used to render Python docs", and
 * round-trips through remark untouched.
 *
 * Discriminator (vs. real Starlight asides):
 *   - mkautodoc:  `::: identifier\n    :body:\n` (indented body, no closing `:::`)
 *   - aside:      `:::name\n  body\n:::`         (non-indented body, closing `:::`)
 *
 * The "next non-blank line is indented 4+ spaces" lookahead distinguishes
 * the two. Aside body is conventionally non-indented; in CommonMark, 4+
 * space indent would be parsed as a code block anyway.
 *
 * Idempotency: the wrapped output is inside a fenced code block, so a
 * second pass sees the inner `:::` as fenced content and skips it.
 *
 * Fenced-code safety: lines inside an existing triple-backtick fence are
 * preserved verbatim — example documentation showing mkautodoc syntax is
 * not double-wrapped.
 */

const FENCE = /^ {0,3}(```|~~~)/;
const MKAUTODOC_OPENER = /^:::\s+\S+/;
const INDENTED_LINE = /^ {4,}\S/;

export function normalizeMkautodocBlocks(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (FENCE.test(line)) {
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

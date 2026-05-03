/**
 * Pre-parse normalizer: wrap fastapi's `{* path *}` source-include marker
 * in a fenced code block so it round-trips cleanly through remark.
 *
 * fastapi uses a custom MkDocs plugin to inline source code from a separate
 * file at build time:
 *
 *   {* ../../docs_src/first_steps/tutorial001.py *}
 *   {* ../../docs_src/first_steps/tutorial001.py hl[3] *}
 *
 * The converter cannot run that plugin. Without normalization,
 * remark-stringify sees the leading `{` and `*` as potentially-significant
 * Markdown punctuation and escapes them defensively (`{\* path \*}`),
 * producing unreadable output.
 *
 * Behavior:
 *   - A line that consists solely of `{* ... *}` (after trimming) is wrapped
 *     in a fenced code block. The original marker is preserved verbatim,
 *     visible to the human reader as a "this used to inline source code"
 *     hint they can replace with their own component or pre-resolution step.
 *   - Inline `{* ... *}` inside a paragraph is left alone. The marker is a
 *     block-level construct in fastapi; an inline match is something else.
 *   - Lines inside an existing triple-backtick fence are passed through.
 *
 * Idempotency: the wrapped output is inside a fenced code block, so a
 * second pass sees the marker as fenced content and skips it.
 */

const FENCE = /^ {0,3}(```|~~~)/;
// Whole-line `{* ... *}` marker. Captures any payload between the markers
// (path + optional `hl[N]` highlight, etc.) but does not require it.
const FASTAPI_INCLUDE_LINE = /^\s*\{\*\s.+\s\*\}\s*$/;

export function normalizeFastapiIncludes(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      out.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (!FASTAPI_INCLUDE_LINE.test(line)) {
      out.push(line);
      continue;
    }
    out.push('```text');
    out.push(line);
    out.push('```');
  }
  return out.join('\n');
}

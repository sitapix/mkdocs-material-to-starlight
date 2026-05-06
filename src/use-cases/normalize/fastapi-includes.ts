/**
 * Pre-parse normalizer: wrap fastapi's `{* path *}` source-include marker
 * in a fenced code block so it round-trips through remark.
 *
 * fastapi inlines source files at build time:
 *   {* ../../docs_src/first_steps/tutorial001.py *}
 *   {* ../../docs_src/first_steps/tutorial001.py hl[3] *}
 *
 * The converter cannot run that plugin. Without wrapping, remark-stringify
 * escapes `{` and `*` to `{\* path \*}` and the output reads as broken.
 *
 * Whole-line `{* ... *}` (after trim) gets fenced; inline matches inside
 * paragraphs and lines inside existing fences pass through.
 *
 * Idempotent: wrapped output sits inside a fence and a second pass skips it.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

// Whole-line `{* ... *}` marker. Captures any payload between the markers
// (path + optional `hl[N]` highlight, etc.) but does not require it.
const FASTAPI_INCLUDE_LINE = /^\s*\{\*\s.+\s\*\}\s*$/;

export function normalizeFastapiIncludes(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (isFenceLine(line)) {
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

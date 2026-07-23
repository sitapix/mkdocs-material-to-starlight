/**
 * Site-level pre-scan: does any source file use a Material admonition type
 * that Starlight's four asides cannot express (abstract, info, question,
 * success, failure, bug, example)?
 *
 * The answer decides — BEFORE any file converts — whether the site installs
 * `starlight-markdown-blocks` and the admonition transform preserves those
 * type names verbatim. It must be a site-level decision: a per-file flag
 * would emit `:::abstract` in one file and a squashed `:::note` in another
 * for the same source construct.
 *
 * Scans raw Material syntax (`!!! type` / `??? type` / `???+ type`), which
 * is what sources contain at pre-pass time — normalization to directive
 * form happens later inside convertFile. Pure.
 */

import { CUSTOM_BLOCK_ADMONITION_TYPES } from '../transform/admonition-mapping.js';

const TYPE_ALTERNATION = [...CUSTOM_BLOCK_ADMONITION_TYPES].join('|');
const ADMONITION_RE = new RegExp(
  String.raw`^[ \t]*(?:!!!|\?\?\?\+?)[ \t]+(?:${TYPE_ALTERNATION})\b`,
  'm',
);

export function detectCustomAdmonitions(sources: Iterable<string>): boolean {
  for (const source of sources) {
    if (ADMONITION_RE.test(source)) return true;
  }
  return false;
}

/**
 * Pre-parse normalizer: strip Material's `attr_list` blob from the end of
 * ATX headings.
 *
 * Material allows:
 *
 *   # First Steps { #first-steps }
 *   ## Check it { #check-it .highlighted }
 *
 * Starlight has no API for explicit heading IDs; its slugger generates them
 * from the heading text, matching the explicit override in most cases.
 * Without normalization the literal `{ #first-steps }` survives into the
 * rendered title bar and synthesized frontmatter title.
 *
 * Behavior: drop a trailing `{ ... }` blob from any line starting with one
 * to six `#` plus a space. Closing-style ATX hashes are preserved
 * (`# Title { #id } #` becomes `# Title #`). Fenced code passes through.
 *
 * Lossy: IDs that diverge from the slug lose their stable anchor.
 * Acceptable today; route through a conversion table if a fixture proves it.
 * Idempotent: a second pass finds no blob.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

// Matches an ATX heading line ending in a `{ ... }` attr_list, with optional
// trailing closing-style hashes preserved.
//   group 1 = leading hashes + space + heading text (no trailing whitespace)
//   group 2 = the attr_list blob (we discard it)
//   group 3 = optional closing-hash suffix (preserved if present)
const HEADING_WITH_ATTRS =
  /^(#{1,6} [^\n{]+?)\s*\{[^}\n]*\}\s*(#*)\s*$/;

export function normalizeHeadingAttrList(source: string): string {
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
    const match = line.match(HEADING_WITH_ATTRS);
    if (match === null) {
      out.push(line);
      continue;
    }
    const heading = (match[1] ?? '').trimEnd();
    const closingHashes = match[2] ?? '';
    out.push(closingHashes === '' ? heading : `${heading} ${closingHashes}`);
  }
  return out.join('\n');
}

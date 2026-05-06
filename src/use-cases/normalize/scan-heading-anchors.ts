/**
 * Scanner: detect heading lines with explicit ID attributes { #slug } and
 * emit one info diagnostic per stripped anchor so users can find every
 * cross-page deep link that needs manual repair.
 *
 * This scanner runs BEFORE normalizeHeadingAttrList strips the anchor, so
 * it can capture the original id. It is a pure read (no text mutation).
 *
 * The full fix (preserving the anchor as <a id="..."> inline HTML) is
 * deferred to a v2 option (--keep-explicit-heading-ids). For now, users
 * get a diagnostic with the heading text and the lost slug so they can
 * re-add the anchor manually.
 */

import {
  createDiagnostic,
  type Diagnostic,
} from '../../domain/diagnostics/diagnostic.js';
import { isFenceLine } from '../../domain/syntax/fence.js';
// Matches a heading with a trailing { ... } attr_list. Captures:
//   group 1 = heading text (without leading hashes)
//   group 2 = full attr_list body (inside the braces)
const HEADING_WITH_ATTRS = /^(#{1,6} [^\n{]+?)\s*\{([^}\n]*)\}\s*#*\s*$/;
// Extracts the first #id from an attr_list body.
const ANCHOR_RE = /#([\w-]+)/;

export function scanHeadingAnchors(
  source: string,
): ReadonlyArray<Diagnostic> {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split('\n');
  let inFence = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const headingMatch = HEADING_WITH_ATTRS.exec(line);
    if (headingMatch === null) continue;

    const attrBody = headingMatch[2] ?? '';
    const anchorMatch = ANCHOR_RE.exec(attrBody);
    if (anchorMatch === null) continue;

    const slug = anchorMatch[1] ?? '';
    const headingText = (headingMatch[1] ?? '').replace(/^#+\s*/, '').trim();
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'heading-explicit-id-stripped',
        source: 'normalize/scan-heading-anchors',
        message: `Heading "${headingText}" had explicit anchor {#${slug}} which was stripped. Cross-page links to #${slug} will break unless re-added as <a id="${slug}"></a>.`,
        place: { line: lineNumber, column: 1 },
      }),
    );
  }

  return diagnostics;
}

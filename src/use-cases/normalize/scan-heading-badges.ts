/**
 * Scanner: detect ATX headings that carry at least one `attr_list` CSS class
 * (e.g. `## What's New { .badge }`, `### Beta { .pill .new }`). The
 * `normalizeHeadingAttrList` step drops the `{ ... }` blob unconditionally,
 * which silently loses Material's heading-badge idiom. This scanner emits one
 * info diagnostic per occurrence so users can audit which headings used a
 * class and decide whether to re-add a `<Badge>` via `starlight-heading-badges`.
 *
 * Pure read (no text mutation). Fence-shielded so attr_list-shaped strings
 * inside fenced code are ignored. Headings whose attr_list contains only an
 * explicit id (`{ #anchor }`) or key=value pairs are not flagged.
 *
 * Idempotent: running twice produces the same diagnostic set.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const FENCE = /^ {0,3}(```|~~~)/;
const HEADING_ATTR_RE = /^#{1,6} [^\n{]+\{([^}\n]*)\}\s*#*\s*$/;
const CLASS_TOKEN_RE = /(?:^|\s)\.[A-Za-z][A-Za-z0-9_-]*/;

export function scanHeadingBadges(source: string): ReadonlyArray<Diagnostic> {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split('\n');
  let inFence = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(HEADING_ATTR_RE);
    if (match === null) continue;
    const attrBody = match[1] ?? '';
    if (!CLASS_TOKEN_RE.test(attrBody)) continue;

    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'heading-badge-class-detected',
        source: 'normalize/scan-heading-badges',
        message:
          'Heading carries an `attr_list` CSS class which Starlight has no built-in equivalent for; the class was stripped. If this was a Material heading badge, install `starlight-heading-badges` and re-add as inline `<Badge>` JSX. If the class served another purpose (e.g. TOC exclusion, layout hint), reproduce it via custom CSS or a rehype plugin.',
        place: { line: lineNumber, column: 1 },
      }),
    );
  }

  return diagnostics;
}

/**
 * Scanner: detect Material admonition openings using the `inline` or
 * `inline end` modifier (`!!! note inline "Title"`, `??? warning inline end`)
 * and emit one info diagnostic per occurrence.
 *
 * The admonitions normalizer extracts the modifier and emits an
 * `inline="left|end"` directive attribute, but the Starlight `<Aside>`
 * component does not honor an `inline` prop — the float positioning is
 * lost in the rendered output. This scanner names every site that relies
 * on the float so users can apply the manual CSS recreation step from
 * the diagnostic's `fix` text.
 *
 * Pure read (no text mutation). Fence-shielded so example markdown
 * inside ``` ``` blocks doesn't false-match. Idempotent: runs on a fixed
 * input shape.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { type LineScanner, runLineScanners } from '../../domain/scanners/line-scanner.js';

const INLINE_RE = /^\s*(?:!!!|\?\?\?\+?)\s+\S+(?:\s+\S+)*\s+inline(\s+end)?\b/;

const inlineAdmonitionScanner: LineScanner = {
  ruleId: 'inline-admonition-modifier-dropped',
  scan: (line, lineNumber) => {
    const match = INLINE_RE.exec(line);
    if (match === null) return null;
    const variant = match[1] !== undefined ? 'inline end' : 'inline';
    return createDiagnostic({
      severity: 'info',
      ruleId: 'inline-admonition-modifier-dropped',
      source: 'normalize/scan-inline-admonitions',
      message:
        'Material admonition with the `' +
        variant +
        "` modifier detected. The float layout (left/right alignment + width constraint) is not preserved by Starlight's `<Aside>` component. The aside will render as a standard block-level element. To recreate, see the registry's `inline-admonition-modifier-dropped` fix.",
      place: { line: lineNumber, column: 1 },
    });
  },
};

export function scanInlineAdmonitions(source: string): ReadonlyArray<Diagnostic> {
  return runLineScanners(source, [inlineAdmonitionScanner]);
}

/**
 * Scanner: detect Material `.copy` / `.no-copy` flags on fenced code blocks
 * and emit one info diagnostic per occurrence.
 *
 * The code-block-meta normalizer strips the Material attr_list `{ ... }`
 * unconditionally — Expressive Code (Starlight's code highlighter) does not
 * recognize per-block copy-button toggles. The strip is silent today; this
 * scanner names every block that carried a flag so users can audit which
 * fences relied on the toggle.
 *
 * Pure read (no text mutation). Skips fences inside fences. Idempotent.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const FENCE_FLAG_RE = /^\s*```+\s*[^\n{]*\{[^}\n]*\.(no-copy|copy)\b[^}\n]*\}/;

export function scanCodeFenceFlags(source: string): ReadonlyArray<Diagnostic> {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split('\n');
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    const match = FENCE_FLAG_RE.exec(line);
    if (match === null) continue;

    const flag = match[1] === 'no-copy' ? '.no-copy' : '.copy';
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'code-fence-copy-flag-stripped',
        source: 'normalize/scan-code-fence-flags',
        message: `Code fence carries the Material \`${flag}\` flag. Expressive Code has no per-block copy-button toggle — the flag was stripped during normalization. To suppress the copy button globally, set \`expressiveCode.frames.showCopyToClipboardButton: false\` in \`astro.config.mjs\`. To suppress per-block, use \`frame="none"\` (which removes the entire chrome).`,
        place: { line: lineNumber, column: 1 },
      }),
    );
  }

  return diagnostics;
}

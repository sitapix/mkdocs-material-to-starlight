/**
 * Pre-parse normalizer: convert `{* path *}` source-include directives to
 * HTML TODO comments and emit info diagnostics.
 *
 * Some sites (Tiangolo-template projects) inline source files at build
 * time using this directive:
 *   {* docs_src/first_steps/tutorial001.py *}
 *   {* docs_src/first_steps/tutorial001.py hl[3] *}
 *
 * The converter cannot run that plugin. The replacement HTML comment
 * preserves the path, survives remark round-trips, and stays grep-able
 * (`TODO.*source include`).
 *
 * Each replacement emits a source-include-directive-detected info diagnostic
 * so the path lands in MIGRATION_NOTES.md. Runs at convert-site level
 * (before convertFile) so diagnostics attach to the file path. Also
 * prevents the mkautodoc normalizer from fencing remaining `{* ... *}`
 * lines.
 *
 * Idempotent: the replacement starts with `<!--` and skips the SNIPPET_LINE
 * pattern.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { isFenceLine } from '../../domain/syntax/fence.js';

// A whole-line {* path *} marker. The path may include highlight hints like
// hl[3] or hl[1,2]. Requires at least one character of payload between the
// markers (an inline match in prose is not a real include directive).
const SNIPPET_LINE = /^\s*\{\*\s+([^*]+?)\s*\*\}\s*$/;

export interface NormalizeSourceIncludeResult {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function normalizeSourceIncludeDirectives(source: string): NormalizeSourceIncludeResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const diagnostics: Diagnostic[] = [];
  let inFence = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    if (isFenceLine(line)) {
      out.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const match = SNIPPET_LINE.exec(line);
    if (match === null) {
      out.push(line);
      continue;
    }
    const payload = match[1] ?? '';
    // Extract just the file path (strip optional hl[...] highlight hint).
    const filePath = payload.replace(/\s+hl\[[\d,\s]+\]\s*$/, '').trim();
    out.push(`<!-- TODO: source-include directive - manually inline contents of: ${filePath} -->`);
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'source-include-directive-detected',
        source: 'normalize/source-include-directive',
        message: `{* ... *} source-include directive at line ${String(lineNumber)}: inline contents of \`${filePath}\` manually.`,
        place: { line: lineNumber, column: 1 },
      }),
    );
  }

  return { text: out.join('\n'), diagnostics };
}

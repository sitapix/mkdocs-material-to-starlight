/**
 * Pre-parse normalizer: convert typer-style {* path *} source-include
 * directives to HTML TODO comments and emit per-occurrence info diagnostics.
 *
 * Typer (and fastapi) use a custom MkDocs macros plugin that inlines source
 * files at build time, e.g.:
 *
 *   {* docs_src/first_steps/tutorial001.py *}
 *   {* docs_src/first_steps/tutorial001.py hl[3] *}
 *
 * The converter cannot run that plugin. Rather than wrapping the directive in
 * a code fence (which buries it and makes the output look like a broken code
 * example), we replace it with an HTML comment that:
 *   - Preserves the path so the author can find every site to inline manually.
 *   - Survives remark-parse + remark-stringify without being mangled.
 *   - Is searchable: grep 'TODO.*typer snippet' finds all occurrences.
 *
 * Each replaced directive emits one typer-snippet-directive-detected info
 * diagnostic so the path appears in MIGRATION_NOTES.md.
 *
 * This runs at the convert-site level (before convertFile) so diagnostics
 * can be attached to the file path. The replacement also prevents the
 * mkautodoc normalizer from fencing any remaining {* ... *} lines.
 *
 * Idempotency: the replacement starts with <!-- which does not match the
 * SNIPPET_LINE pattern, so a second pass skips it.
 */

import {
  createDiagnostic,
  type Diagnostic,
} from '../../domain/diagnostics/diagnostic.js';

const FENCE = /^ {0,3}(```|~~~)/;
// A whole-line {* path *} marker. The path may include highlight hints like
// hl[3] or hl[1,2]. Requires at least one character of payload between the
// markers (an inline match in prose is not a real include directive).
const SNIPPET_LINE = /^\s*\{\*\s+([^*]+?)\s*\*\}\s*$/;

export interface NormalizeTyperSnippetsResult {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function normalizeTyperSnippetDirectives(
  source: string,
): NormalizeTyperSnippetsResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const diagnostics: Diagnostic[] = [];
  let inFence = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    if (FENCE.test(line)) {
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
    out.push(
      `<!-- TODO: typer snippet directive - manually inline contents of: ${filePath} -->`,
    );
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'typer-snippet-directive-detected',
        source: 'normalize/typer-snippet-directives',
        message: `typer {* ... *} directive at line ${String(lineNumber)}: inline contents of \`${filePath}\` manually.`,
        place: { line: lineNumber, column: 1 },
      }),
    );
  }

  return { text: out.join('\n'), diagnostics };
}

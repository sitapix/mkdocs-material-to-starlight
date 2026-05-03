/**
 * Pre-parse normalizer: reduce mkdocstrings cross-references to inline code.
 *
 * mkdocstrings uses a special link shorthand for Python API cross-references:
 *
 *   [`bool`][]             -- shorthand for the `bool` type
 *   [`bool`][builtins.bool] -- explicit path to `bool` in the builtins module
 *   [`StrictBool`][pydantic.types.StrictBool]
 *
 * In the rendered MkDocs site, mkdocstrings turns these into links to the
 * relevant API page. The converter cannot resolve Python autodoc targets in
 * Starlight, so the link decoration is stripped and only the inline code
 * portion is kept.
 *
 * Before this normalizer runs, remark-stringify would escape the `[` and `]`
 * characters to `\[` and `\]`, producing visible literal noise in the output.
 * This normalizer replaces the full `[`X`][...]` form with just `` `X` ``
 * before remark sees it.
 *
 * Scope: only backtick-quoted cross-references are handled. Plain text refs
 * like `[foo][bar]` are left to the link-rewrite stage.
 *
 * Idempotency: the output `` `X` `` does not contain `][`, so a second pass
 * finds nothing to rewrite.
 */

import {
  createDiagnostic,
  type Diagnostic,
} from '../../domain/diagnostics/diagnostic.js';

const FENCE = /^ {0,3}(```|~~~)/;
// Matches [`X`][] or [`X`][target] where X is the content of the backtick
// and target is an optional fully-qualified Python path.
// Captures group 1 = the inner code text (without backticks).
const CROSS_REF_RE = /\[`([^`]+)`\]\[[^\]]*\]/g;

export interface ScanCrossRefsResult {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function normalizeMkdocstringsCrossRefs(
  source: string,
): ScanCrossRefsResult {
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

    let lastIndex = 0;
    let transformed = '';
    let hadMatch = false;
    for (const match of line.matchAll(CROSS_REF_RE)) {
      hadMatch = true;
      const start = match.index ?? 0;
      transformed += line.slice(lastIndex, start);
      const codeText = match[1] ?? '';
      transformed += `\`${codeText}\``;
      lastIndex = start + match[0].length;
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'mkdocstrings-cross-ref-stripped',
          source: 'normalize/mkdocstrings-crossref',
          message: `mkdocstrings cross-ref \`[${"`"}${codeText}${"`"}][...]\` reduced to inline code \`${codeText}\`.`,
          place: { line: lineNumber, column: (match.index ?? 0) + 1 },
        }),
      );
    }
    if (hadMatch) {
      transformed += line.slice(lastIndex);
      out.push(transformed);
    } else {
      out.push(line);
    }
  }

  return { text: out.join('\n'), diagnostics };
}

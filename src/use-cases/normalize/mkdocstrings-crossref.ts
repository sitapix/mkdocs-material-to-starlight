/**
 * Pre-parse normalizer: reduce mkdocstrings cross-references to inline code.
 *
 *   [`bool`][]                          → `bool`
 *   [`bool`][builtins.bool]             → `bool`
 *   [`StrictBool`][pydantic.types...]   → `StrictBool`
 *
 * mkdocstrings rewrites these to API links at build time. The converter
 * cannot resolve Python autodoc targets in Starlight, so it drops the link
 * decoration and keeps the inline code.
 *
 * Without this pass, remark-stringify escapes `[` and `]` to `\[` and `\]`
 * and the output reads as literal noise.
 *
 * Scope: backtick-quoted cross-refs only; plain `[foo][bar]` is the
 * link-rewrite stage's job.
 *
 * Idempotent: output `` `X` `` contains no `][`.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { isFenceLine } from '../../domain/syntax/fence.js';

// Matches [`X`][] or [`X`][target] where X is the content of the backtick
// and target is an optional fully-qualified Python path.
// Captures group 1 = the inner code text (without backticks).
const CROSS_REF_RE = /\[`([^`]+)`\]\[[^\]]*\]/g;

export interface ScanCrossRefsResult {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function normalizeMkdocstringsCrossRefs(source: string): ScanCrossRefsResult {
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
          message: `mkdocstrings cross-ref \`[${'`'}${codeText}${'`'}][...]\` reduced to inline code \`${codeText}\`.`,
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

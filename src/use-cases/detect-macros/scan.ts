/**
 * Scan a Markdown source for `mkdocs-macros-plugin` Jinja2 syntax.
 *
 * The converter cannot evaluate Jinja2, so the goal of this scan is to give
 * users an exhaustive map of every `{{ ... }}` and `{% ... %}` occurrence so
 * they can replace them by hand. Each occurrence becomes a diagnostic with a
 * 1-based line and column locator.
 *
 * `{% include %}` / `{% include-markdown %}` directives are intentionally
 * skipped — they belong to a different plugin (mkdocs-include-markdown-plugin)
 * and are handled by `expandIncludeMarkdown`. Reporting them as macros would
 * be noise.
 *
 * Pure: takes a source string, returns an immutable array of diagnostics.
 * The scanner is line-based and does not parse Markdown — macros inside
 * fenced code blocks are also reported, on the assumption that users may want
 * to know about them anyway. The behavior is locked in by test.
 */

import {
  createDiagnostic,
  type Diagnostic,
} from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'detect-macros/scan';
const VARIABLE_RE = /\{\{[^}]+\}\}/g;
const STATEMENT_RE = /\{%[\s\S]+?%\}/g;
const INCLUDE_TAG_RE = /^\{%\s*(include-markdown|include)\b/;

export function scanMacroOccurrences(
  source: string,
): ReadonlyArray<Diagnostic> {
  const diagnostics: Diagnostic[] = [];
  collectMatches(source, VARIABLE_RE, diagnostics);
  collectStatements(source, diagnostics);
  // Sort by (line, column) so output is deterministic regardless of which
  // regex finished first.
  return [...diagnostics].sort(byPlace);
}

function collectMatches(
  source: string,
  re: RegExp,
  out: Diagnostic[],
): void {
  for (const match of source.matchAll(re)) {
    const index = match.index ?? 0;
    const place = lineColumnAt(source, index);
    out.push(buildDiagnostic(match[0], place));
  }
}

function collectStatements(source: string, out: Diagnostic[]): void {
  for (const match of source.matchAll(STATEMENT_RE)) {
    const text = match[0];
    if (INCLUDE_TAG_RE.test(text)) continue;
    const index = match.index ?? 0;
    const place = lineColumnAt(source, index);
    out.push(buildDiagnostic(text, place));
  }
}

function buildDiagnostic(
  expression: string,
  place: { line: number; column: number },
): Diagnostic {
  return createDiagnostic({
    severity: 'warning',
    ruleId: 'plugin-macros-occurrence',
    source: SOURCE,
    message: `mkdocs-macros expression \`${truncate(expression)}\` will not be evaluated; replace it with literal Markdown or an Astro component.`,
    place,
  });
}

function lineColumnAt(
  source: string,
  index: number,
): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < index; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
      lastNewline = i;
    }
  }
  return { line, column: index - lastNewline };
}

function truncate(text: string): string {
  if (text.length <= 80) return text.trim();
  return `${text.slice(0, 77).trim()}...`;
}

function byPlace(a: Diagnostic, b: Diagnostic): number {
  const aLine = a.place?.line ?? 0;
  const bLine = b.place?.line ?? 0;
  if (aLine !== bLine) return aLine - bLine;
  return (a.place?.column ?? 0) - (b.place?.column ?? 0);
}

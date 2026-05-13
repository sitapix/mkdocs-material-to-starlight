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
 * Fenced code blocks and inline code spans are also skipped: documentation
 * commonly demonstrates Jinja2 syntax inside code examples, and flagging
 * those as macros generates false positives the user cannot act on. Fence
 * tracking is handled universally by `runLineScanners`; inline-code spans
 * are tested per-line here.
 *
 * Pure: takes a source string, returns an immutable array of diagnostics.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { type LineScanner, runLineScanners } from '../../domain/scanners/line-scanner.js';

const SOURCE = 'detect-macros/scan';
const MACRO_RE = /\{\{[^}]+\}\}|\{%[\s\S]*?%\}/g;
const INCLUDE_TAG_RE = /^\{%\s*(include-markdown|include)\b/;

const macroScanner: LineScanner = {
  ruleId: 'plugin-macros-occurrence',
  scan: (line, lineNumber) => {
    const out: Diagnostic[] = [];
    for (const match of line.matchAll(MACRO_RE)) {
      const text = match[0];
      if (text.startsWith('{%') && INCLUDE_TAG_RE.test(text)) continue;
      const column = (match.index ?? 0) + 1;
      if (isInsideInlineCode(column - 1, line)) continue;
      out.push(buildDiagnostic(text, { line: lineNumber, column }));
    }
    return out;
  },
};

export function scanMacroOccurrences(source: string): ReadonlyArray<Diagnostic> {
  return runLineScanners(source, [macroScanner]);
}

function isInsideInlineCode(charIndex: number, line: string): boolean {
  let ticks = 0;
  for (let i = 0; i < charIndex; i += 1) {
    if (line[i] === '`') ticks += 1;
  }
  return ticks % 2 === 1;
}

function buildDiagnostic(expression: string, place: { line: number; column: number }): Diagnostic {
  return createDiagnostic({
    severity: 'warning',
    ruleId: 'plugin-macros-occurrence',
    source: SOURCE,
    message: `mkdocs-macros expression \`${truncate(expression)}\` will not be evaluated; replace it with literal Markdown or an Astro component.`,
    place,
  });
}

function truncate(text: string): string {
  if (text.length <= 80) return text.trim();
  return `${text.slice(0, 77).trim()}...`;
}

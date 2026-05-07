/**
 * Unconditional scan for Jinja2-style {{ expr }} macro expressions in a
 * Markdown source file, excluding content inside fenced code blocks.
 *
 * Unlike scanMacroOccurrences (which only runs when the macros plugin is
 * declared in mkdocs.yml), this scanner runs on every file. It catches
 * projects like pydantic that use {{ macro }} syntax without listing the
 * macros plugin explicitly.
 *
 * The scanner is line-based and skips lines inside triple-backtick fences.
 * {% ... %} statements are intentionally excluded here -- they are either
 * include directives (handled by include-markdown) or require the macros
 * plugin scan to be meaningful. This scanner focuses on {{ expression }}
 * variable substitution only, which is the most common source of blank tab
 * bodies and missing content in the converted output.
 *
 * Pure: source string → Diagnostic[]. No side effects.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { type LineScanner, runLineScanners } from '../../domain/scanners/line-scanner.js';

const SOURCE = 'detect-macros/scan-expressions';
const VARIABLE_RE = /\{\{[^}]+\}\}/g;

const macroExpressionScanner: LineScanner = {
  ruleId: 'macros-expression-detected',
  scan: (line, lineNumber) => {
    const matches = [...line.matchAll(VARIABLE_RE)];
    if (matches.length === 0) return null;
    return matches.map((match) => {
      const expression = match[0];
      const column = (match.index ?? 0) + 1;
      return createDiagnostic({
        severity: 'info',
        ruleId: 'macros-expression-detected',
        source: SOURCE,
        message: `Jinja2 expression \`${truncate(expression)}\` at line ${String(lineNumber)} will not be evaluated; replace with literal Markdown or an Astro component.`,
        place: { line: lineNumber, column },
      });
    });
  },
};

export function scanMacroExpressions(source: string): ReadonlyArray<Diagnostic> {
  return runLineScanners(source, [macroExpressionScanner]);
}

function truncate(text: string): string {
  if (text.length <= 80) return text.trim();
  return `${text.slice(0, 77).trim()}...`;
}

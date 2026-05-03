/**
 * Format a diagnostic report as terminal-friendly text.
 *
 * Pure: takes the tagged-diagnostic list, returns a multi-line string. No
 * colors or ANSI escapes are added here — that responsibility belongs to a
 * separate decorator if the user wants color output.
 *
 * Each line follows the unified-style locator format:
 *   <source-path>:<line>:<column>  <severity>  <ruleId>  <message>
 *
 * Followed by a summary of severity counts.
 */

import type { TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';

export function formatReport(diagnostics: ReadonlyArray<TaggedDiagnostic>): string {
  if (diagnostics.length === 0) {
    return 'OK — 0 issues found.\n';
  }

  const lines: string[] = [];
  for (const tagged of diagnostics) {
    lines.push(formatOne(tagged));
  }
  lines.push('', summarize(diagnostics));
  return lines.join('\n') + '\n';
}

function formatOne(tagged: TaggedDiagnostic): string {
  const place = tagged.diagnostic.place;
  const locator =
    place === undefined
      ? tagged.sourcePath
      : `${tagged.sourcePath}:${String(place.line)}:${String(place.column)}`;
  return `${locator}  ${tagged.diagnostic.severity}  ${tagged.diagnostic.ruleId}  ${tagged.diagnostic.message}`;
}

function summarize(diagnostics: ReadonlyArray<TaggedDiagnostic>): string {
  const counts = { info: 0, warning: 0, error: 0 };
  for (const tagged of diagnostics) {
    counts[tagged.diagnostic.severity] += 1;
  }
  const parts: string[] = [];
  if (counts.error > 0) parts.push(`${counts.error} ${pluralize(counts.error, 'error')}`);
  if (counts.warning > 0) parts.push(`${counts.warning} ${pluralize(counts.warning, 'warning')}`);
  if (counts.info > 0) parts.push(`${counts.info} info`);
  return parts.join(', ');
}

function pluralize(n: number, singular: string): string {
  return n === 1 ? singular : `${singular}s`;
}

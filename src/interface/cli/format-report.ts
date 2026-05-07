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
 *
 * Security: every interpolated string (sourcePath, ruleId, message) is
 * passed through `sanitizeForSingleLine` to defend against terminal-escape
 * injection (CWE-150). A hostile mkdocs.yml or third-party error message
 * could otherwise embed cursor-movement / window-title sequences that
 * compromise the user's terminal session.
 */

import { sanitizeForSingleLine } from '../../infrastructure/terminal/sanitize-terminal-output.js';
import type { TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';

// When a single ruleId has more than COLLAPSE_AT occurrences, only the first
// SHOW_FIRST are printed and the rest are summarised on one line. This stops
// 88-line walls (real regression: zbghost325/XRIML-WIKI's
// `unknown-frontmatter-field`) from drowning out useful diagnostics. The
// complete list is always available in MIGRATION_NOTES.md.
const COLLAPSE_AT = 5;
const SHOW_FIRST = 3;

export function formatReport(
  diagnostics: ReadonlyArray<TaggedDiagnostic>,
  outputDir?: string,
): string {
  const notesPath =
    outputDir !== undefined && outputDir.length > 0
      ? `${sanitizeForSingleLine(outputDir).replace(/\/$/, '')}/MIGRATION_NOTES.md`
      : 'MIGRATION_NOTES.md';

  if (diagnostics.length === 0) {
    const where =
      outputDir !== undefined && outputDir.length > 0
        ? sanitizeForSingleLine(outputDir).replace(/\/$/, '')
        : '<output-dir>';
    return (
      `OK — 0 issues found. Site converted cleanly.\n` +
      `Next: cd ${where} && npm install && npm run dev\n` +
      `Docs: https://starlight.astro.build/\n`
    );
  }

  const groups = groupByRuleId(diagnostics);
  const lines: string[] = [];
  for (const { ruleId, items } of groups) {
    const collapse = items.length > COLLAPSE_AT;
    const visible = collapse ? items.slice(0, SHOW_FIRST) : items;
    for (const tagged of visible) {
      lines.push(formatOne(tagged));
    }
    if (collapse) {
      const hidden = items.length - SHOW_FIRST;
      lines.push(`  … and ${String(hidden)} more "${ruleId}" — see ${notesPath} for the full list`);
    }
  }
  lines.push('', summarize(diagnostics));
  if (diagnostics.length > 0) {
    lines.push(`Full report with descriptions and fixes: ${notesPath}`);
  }
  return `${lines.join('\n')}\n`;
}

interface RuleGroup {
  readonly ruleId: string;
  readonly items: ReadonlyArray<TaggedDiagnostic>;
}

// Group by ruleId, preserving the order in which each ruleId first appears.
// Groups stay together so a user reading the report sees every "broken-link"
// before every "unknown-frontmatter-field", which is more useful than the
// per-file interleaving the input might have.
function groupByRuleId(diagnostics: ReadonlyArray<TaggedDiagnostic>): ReadonlyArray<RuleGroup> {
  const order: string[] = [];
  const buckets = new Map<string, TaggedDiagnostic[]>();
  for (const tagged of diagnostics) {
    const id = tagged.diagnostic.ruleId;
    let bucket = buckets.get(id);
    if (bucket === undefined) {
      bucket = [];
      buckets.set(id, bucket);
      order.push(id);
    }
    bucket.push(tagged);
  }
  return order.map((id) => ({ ruleId: id, items: buckets.get(id) ?? [] }));
}

function formatOne(tagged: TaggedDiagnostic): string {
  const safePath = sanitizeForSingleLine(tagged.sourcePath);
  const safeRuleId = sanitizeForSingleLine(tagged.diagnostic.ruleId);
  const safeMessage = sanitizeForSingleLine(tagged.diagnostic.message);
  const place = tagged.diagnostic.place;
  const locator =
    place === undefined ? safePath : `${safePath}:${String(place.line)}:${String(place.column)}`;
  return `${locator}  ${tagged.diagnostic.severity}  ${safeRuleId}  ${safeMessage}`;
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

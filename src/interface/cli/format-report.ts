/**
 * Format a diagnostic report as terminal-friendly text.
 *
 * Each line follows the unified-style locator format:
 *   <source-path>:<line>:<column>  <severity>  <ruleId>  <message>
 *
 * Followed by a summary of severity counts.
 *
 * Color: applied via picocolors, which auto-disables under `NO_COLOR`,
 * non-TTY stdout, and the `FORCE_COLOR=0` env var. Tests run with no
 * TTY → picocolors no-ops → assertions on plain substrings still pass.
 * The colors are ours (added after sanitization), so they're trustworthy:
 * the hostile-input strip below removes any ANSI from user-controlled
 * fields BEFORE we add our own decoration.
 *
 * Security: every interpolated user-controlled string (sourcePath,
 * ruleId, message) is passed through `sanitizeForSingleLine` BEFORE any
 * picocolors call, so a hostile mkdocs.yml or third-party error message
 * cannot embed cursor-movement / window-title sequences (CWE-150). The
 * ANSI codes that survive in the final string are exclusively the ones
 * picocolors emits for our own coloring.
 */

import pc from 'picocolors';
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
      `${pc.green(pc.bold('OK'))} — 0 issues found. Site converted cleanly.\n` +
      `Next: ${pc.cyan(`cd ${where} && npm install && npm run dev`)}\n` +
      `Docs: ${pc.cyan(pc.underline('https://starlight.astro.build/'))}\n`
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
      lines.push(
        pc.dim(`  … and ${String(hidden)} more "${ruleId}" — see ${notesPath} for the full list`),
      );
    }
  }
  lines.push('', summarize(diagnostics));
  if (diagnostics.length > 0) {
    lines.push(`Full report with descriptions and fixes: ${pc.cyan(pc.underline(notesPath))}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Map severity → color. Errors are red+bold (the loud stop sign), warnings
 * are yellow (caution), info is blue (neutral mention). Matches `eslint`,
 * `tsc`, and most linters' conventions so the eye already knows what to
 * scan for.
 */
function colorSeverity(severity: 'info' | 'warning' | 'error', text: string): string {
  if (severity === 'error') return pc.red(pc.bold(text));
  if (severity === 'warning') return pc.yellow(text);
  return pc.blue(text);
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
  // Path dim, severity colored by level, ruleId bold-cyan, message normal.
  // Two spaces between fields stay so existing grep / awk pipelines keep working.
  const severity = tagged.diagnostic.severity;
  return `${pc.dim(locator)}  ${colorSeverity(severity, severity)}  ${pc.bold(pc.cyan(safeRuleId))}  ${safeMessage}`;
}

function summarize(diagnostics: ReadonlyArray<TaggedDiagnostic>): string {
  const counts = { info: 0, warning: 0, error: 0 };
  for (const tagged of diagnostics) {
    counts[tagged.diagnostic.severity] += 1;
  }
  const parts: string[] = [];
  if (counts.error > 0) {
    parts.push(colorSeverity('error', `${counts.error} ${pluralize(counts.error, 'error')}`));
  }
  if (counts.warning > 0) {
    parts.push(
      colorSeverity('warning', `${counts.warning} ${pluralize(counts.warning, 'warning')}`),
    );
  }
  if (counts.info > 0) {
    parts.push(colorSeverity('info', `${counts.info} info`));
  }
  return parts.join('  ');
}

function pluralize(n: number, singular: string): string {
  return n === 1 ? singular : `${singular}s`;
}

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
import type { Severity } from '../../domain/diagnostics/diagnostic.js';
import { sanitizeForSingleLine } from '../../infrastructure/terminal/sanitize-terminal-output.js';
import type { TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';

// When a single ruleId has more than COLLAPSE_AT occurrences, only the first
// SHOW_FIRST are printed and the rest are summarised on one line. This stops
// 88-line walls (real regression: zbghost325/XRIML-WIKI's
// `unknown-frontmatter-field`) from drowning out useful diagnostics. The
// complete list is always available in MIGRATION_NOTES.md.
const COLLAPSE_AT = 5;
const SHOW_FIRST = 3;

export interface FormatReportOptions {
  /**
   * Expand info-severity groups so they render rows + collapse summary like
   * warnings and errors. Defaults to false. Info diagnostics are background
   * context; rendering every row inflates the report without surfacing new
   * actions. Errors and warnings ignore this flag and always render rows.
   */
  readonly verbose?: boolean;
}

export function formatReport(
  diagnostics: ReadonlyArray<TaggedDiagnostic>,
  outputDir?: string,
  options: FormatReportOptions = {},
): string {
  const verbose = options.verbose === true;
  const where = resolveOutputDir(outputDir);
  const notesPath = where === '<output-dir>' ? 'MIGRATION_NOTES.md' : `${where}/MIGRATION_NOTES.md`;
  const nextLine = `Next: ${pc.cyan(`cd ${where} && npm install && npm run dev`)}`;

  if (diagnostics.length === 0) {
    return (
      `${pc.green(pc.bold('OK'))} — 0 issues found. Site converted cleanly.\n` +
      `${nextLine}\n` +
      `Docs: ${pc.cyan(pc.underline('https://starlight.astro.build/'))}\n`
    );
  }

  const groups = groupByRuleId(diagnostics);
  const lines: string[] = [];
  let foldedInfoGroupCount = 0;
  for (let g = 0; g < groups.length; g += 1) {
    const group = groups[g];
    if (group === undefined) continue;
    // Blank line between rule groups so the eye can chunk the report by
    // ruleId. The first group needs no leading blank — that's reserved for
    // the gap before the summary.
    if (g > 0) lines.push('');
    const { ruleId, items } = group;
    const severity = items[0]?.diagnostic.severity ?? 'info';
    const foldRows = severity === 'info' && !verbose;
    lines.push(formatGroupHeader(ruleId, items));
    if (foldRows) {
      foldedInfoGroupCount += 1;
      const teaser = formatTeaser(items[0]);
      if (teaser !== null) lines.push(teaser);
      continue;
    }
    const collapse = items.length > COLLAPSE_AT;
    const visible = collapse ? items.slice(0, SHOW_FIRST) : items;
    // Pad locators within the group so message text starts at the same
    // column on every line of the group.
    const pathPad = Math.max(...visible.map((t) => locatorWidth(t)));
    for (const tagged of visible) {
      lines.push(formatOne(tagged, pathPad));
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
  if (foldedInfoGroupCount > 0) {
    lines.push(
      pc.dim(
        `Info detail folded (${String(foldedInfoGroupCount)} ${foldedInfoGroupCount === 1 ? 'group' : 'groups'}); re-run with --verbose to expand, or read ${notesPath}.`,
      ),
    );
  }
  // Skip the next-step hint when any error fires — `npm run dev` would fail.
  if (!diagnostics.some((t) => t.diagnostic.severity === 'error')) {
    lines.push(nextLine);
  }
  return `${lines.join('\n')}\n`;
}

function resolveOutputDir(outputDir: string | undefined): string {
  if (outputDir === undefined || outputDir.length === 0) return '<output-dir>';
  return sanitizeForSingleLine(outputDir).replace(/\/$/, '');
}

/**
 * Map severity → color. Errors are red+bold (the loud stop sign), warnings
 * are yellow (caution), info is blue (neutral mention). Matches `eslint`,
 * `tsc`, and most linters' conventions so the eye already knows what to
 * scan for.
 */
function colorSeverity(severity: Severity, text: string): string {
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

// Above this length, fall back to the punchline (first sentence) and let
// MIGRATION_NOTES.md carry the elaboration. Long prose wraps to column zero in
// most terminals and shreds the visual column layout (real regression: the
// `tab-anchors-not-preserved` and `plugin-blog-custom-config` rows visibly
// bled into adjacent diagnostics).
const MESSAGE_SOFT_LIMIT = 120;
// Hard cap used when the first sentence itself runs long. Keeps a single very
// long sentence from sprawling across multiple wrapped lines.
const MESSAGE_HARD_LIMIT = 200;

function truncateMessage(message: string): string {
  if (message.length <= MESSAGE_SOFT_LIMIT) return message;
  // First sentence boundary: `.`, `!`, or `?` followed by whitespace or EOL.
  // The lookbehind skips cases where the period follows a digit — those are
  // typically list ordinals (`1.`, `2.`) or version numbers embedded in a
  // quoted title inside the message, not real sentence endings.
  const m = message.match(/(?<![0-9])[.!?](?=\s|$)/);
  if (m !== null && m.index !== undefined) {
    const end = m.index + 1;
    if (end <= MESSAGE_HARD_LIMIT) return `${message.slice(0, end)} …`;
  }
  return `${message.slice(0, MESSAGE_HARD_LIMIT - 1).trimEnd()}…`;
}

function locatorOf(tagged: TaggedDiagnostic): string {
  const safePath = sanitizeForSingleLine(tagged.sourcePath);
  const place = tagged.diagnostic.place;
  return place === undefined
    ? safePath
    : `${safePath}:${String(place.line)}:${String(place.column)}`;
}

function locatorWidth(tagged: TaggedDiagnostic): number {
  return locatorOf(tagged).length;
}

function formatGroupHeader(ruleId: string, items: ReadonlyArray<TaggedDiagnostic>): string {
  const safeRuleId = sanitizeForSingleLine(ruleId);
  const severity = items[0]?.diagnostic.severity ?? 'info';
  const severityTag = colorSeverity(severity, severity);
  // ruleId is the section title (bold cyan); the parens give severity + count
  // dimly so the eye reads the ruleId first and uses the meta as a sub-cue.
  const meta = `${pc.dim('(')}${severityTag}${pc.dim(`, ${String(items.length)})`)}`;
  return `${pc.bold(pc.cyan(safeRuleId))}  ${meta}`;
}

/**
 * Build a one-line teaser for a folded info group: the first sentence of
 * the group's first message, dim and indented. The user still sees the
 * action signal ("Install starlight-openapi") without --verbose. Returns
 * null if the group is empty.
 */
function formatTeaser(first: TaggedDiagnostic | undefined): string | null {
  if (first === undefined) return null;
  const safe = truncateMessage(sanitizeForSingleLine(first.diagnostic.message));
  return `  ${pc.dim(safe)}`;
}

function formatOne(tagged: TaggedDiagnostic, pathPad: number): string {
  const safeMessage = truncateMessage(sanitizeForSingleLine(tagged.diagnostic.message));
  const locator = locatorOf(tagged);
  // Indented bullet · dim path (right-padded so messages align inside the
  // group) · plain message. Severity moved to the group header — every row
  // in a group shares the same severity, so repeating it on every line was
  // pure noise. Padding is applied to the unstyled string so coloring does
  // not affect column width.
  const locatorPadded = locator.padEnd(pathPad);
  return `  ${pc.dim('•')} ${pc.dim(locatorPadded)}  ${safeMessage}`;
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

/**
 * Serialize a `VisualDiffReport` as a Markdown document.
 *
 * Pure: takes the typed report, returns text. Output is grouped:
 *   1. Header with the configured threshold and one-line summary
 *   2. "Needs review" section listing every non-match result
 *   3. "Matched pages" section listing the matched paths
 *
 * The mismatch ratio is rendered as a percentage with two decimals so
 * comparable runs produce comparable diffs in CI.
 */

import type { PageDiffResult, VisualDiffReport } from '../../domain/visual-diff/page-diff.js';

export function serializeVisualDiffReport(report: VisualDiffReport): string {
  const lines: string[] = [];
  lines.push('# Visual Diff Report', '');
  lines.push(
    `threshold: ${formatPercent(report.threshold)} | matched: ${String(report.summary.matched)} / ${String(report.summary.total)} | mismatched: ${String(report.summary.mismatched)} | capture-failed: ${String(report.summary.captureFailed)} | diff-failed: ${String(report.summary.diffFailed)}`,
  );
  lines.push('');

  if (report.results.length === 0) {
    lines.push('No pages compared.');
    lines.push('');
    return lines.join('\n');
  }

  const failures = report.results.filter((r) => r.status !== 'match');
  const matches = report.results.filter((r) => r.status === 'match');

  if (failures.length > 0) {
    lines.push('## Needs review', '');
    for (const r of failures) {
      lines.push(formatRow(r));
    }
    lines.push('');
  }

  if (matches.length > 0) {
    lines.push('## Matched pages', '');
    for (const r of matches) {
      lines.push(`- \`${r.path}\` — ${formatRatio(r)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatRow(result: PageDiffResult): string {
  const head = `- \`${result.path}\` — **${result.status}**`;
  if (result.status === 'mismatch') {
    return `${head}: ${formatRatio(result)}`;
  }
  if (result.failureReason !== undefined) {
    return `${head}: ${result.failureReason}`;
  }
  return head;
}

function formatRatio(result: PageDiffResult): string {
  if (result.mismatchRatio === undefined) return 'no diff data';
  return formatPercent(result.mismatchRatio);
}

function formatPercent(ratio: number): string {
  const pct = ratio * 100;
  if (pct === 0) return '0%';
  if (Number.isInteger(pct)) return `${String(pct)}%`;
  return `${pct.toFixed(2)}%`;
}

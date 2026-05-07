/**
 * LineScanner — the shared infrastructure every per-line text scanner uses.
 *
 * The 20+ `scan-*.ts` modules under `use-cases/normalize/` all share the same
 * preamble: split source by newline, walk lines, track CommonMark fenced-code
 * state, skip fenced lines, apply a per-line predicate, and emit a Diagnostic
 * with the matched line number. Each scanner used to inline this preamble.
 * Now they declare a `LineScanner` and let `runLineScanners` do the bookkeeping.
 *
 * Module shape:
 *   - `scan(line, lineNumber)` returns a Diagnostic or null per line.
 *   - The scanner sees only non-fenced lines; fence handling is universal.
 *   - Multiple scanners run against the same source in one pass.
 *   - Diagnostics are collected in source order across all scanners — earlier
 *     lines first, regardless of scanner registry order.
 *
 * Pure: text in, diagnostics out. Reuses `domain/syntax/fence.ts` for the
 * CommonMark §4.5 fence test (handles inline-code edge cases).
 */

import type { Diagnostic } from '../diagnostics/diagnostic.js';
import { isFenceLine } from '../syntax/fence.js';

export interface LineScanner {
  /** Stable identifier; matches the rule the scanner emits. */
  readonly ruleId: string;
  /**
   * Inspect a single non-fenced line. Return a Diagnostic to record a
   * finding, or `null` to skip. `lineNumber` is 1-based to match how
   * Diagnostic places are reported elsewhere in the codebase.
   */
  readonly scan: (line: string, lineNumber: number) => Diagnostic | null;
}

export function runLineScanners(
  source: string,
  scanners: ReadonlyArray<LineScanner>,
): ReadonlyArray<Diagnostic> {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const lineNumber = i + 1;
    for (const scanner of scanners) {
      const diagnostic = scanner.scan(line, lineNumber);
      if (diagnostic !== null) {
        diagnostics.push(diagnostic);
      }
    }
  }
  return diagnostics;
}

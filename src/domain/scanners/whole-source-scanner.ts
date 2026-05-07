/**
 * WholeSourceScanner — sibling abstraction to LineScanner for scanners
 * whose internal shape doesn't fit the per-line, fence-shielded contract:
 *
 *   - line-walks that *opt out* of fence-shielding (scan-code-fence-flags
 *     wants to inspect fence opener lines, not skip them);
 *   - line-walks that *accumulate and dedupe* into a single emitted
 *     diagnostic (scan-button-icons);
 *   - whole-source regex with no line walk at all (scan-placeholder-pages);
 *   - line-walks with short-circuit on first match (scan-tab-anchors);
 *   - frontmatter-only regex (scan-frontmatter-fields,
 *     scan-material-markers' comments-true sub-scanner);
 *   - composite scanners that mix the shapes above (scan-material-markers).
 *
 * Each scanner owns its own loop — the runner doesn't try to abstract the
 * inside. It just normalizes the *external contract* (every scanner takes
 * a source string and returns 0..N diagnostics) and the *call-site shape*
 * (the orchestrator now runs many of them with one expression instead of
 * a for-loop per scanner). LineScanner-shaped scanners can also be wrapped
 * in this runner via a thin adapter.
 *
 * The two return shapes (`Diagnostic[]`-vs-`Diagnostic | null`) are both
 * accepted so neither family of existing scanners has to change its
 * external API.
 */

import type { Diagnostic } from '../diagnostics/diagnostic.js';

/** A scanner that consumes a whole source string and emits 0..N diagnostics. */
export interface WholeSourceScanner {
  /** Stable identifier (informational; the diagnostics carry their own ruleId). */
  readonly name: string;
  /**
   * Run against the source. Return:
   *   - an array of Diagnostics (0 or more findings),
   *   - a single Diagnostic (one finding),
   *   - or null (no findings).
   * Empty arrays and null are treated identically.
   */
  readonly scan: (source: string) => ReadonlyArray<Diagnostic> | Diagnostic | null;
}

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

/**
 * Run every scanner against the source and return a flat list of
 * diagnostics tagged with the file's source path. Scanner order is
 * preserved (each scanner's findings are contiguous in output order).
 */
export function runWholeSourceScanners(
  source: string,
  sourcePath: string,
  scanners: ReadonlyArray<WholeSourceScanner>,
): ReadonlyArray<TaggedDiagnostic> {
  const out: TaggedDiagnostic[] = [];
  for (const scanner of scanners) {
    const result = scanner.scan(source);
    if (result === null) continue;
    if (Array.isArray(result)) {
      for (const d of result) out.push({ sourcePath, diagnostic: d });
    } else {
      out.push({ sourcePath, diagnostic: result as Diagnostic });
    }
  }
  return out;
}

/**
 * Typed shape of a per-page visual diff result.
 *
 * Pure data — produced by the compare use-case, consumed by the report
 * serializer and the CLI. The match decision (`status`) is computed once at
 * the use-case layer using the configured threshold; downstream code does
 * not re-evaluate the ratio.
 *
 * Statuses:
 *   - 'match'         — mismatch ratio at or below threshold
 *   - 'mismatch'      — mismatch ratio exceeded threshold
 *   - 'capture-failed' — one of the two screenshots could not be taken
 *   - 'diff-failed'    — screenshots taken but the differ rejected them
 *                        (e.g., dimension mismatch)
 */

type PageDiffStatus = 'match' | 'mismatch' | 'capture-failed' | 'diff-failed';

export interface DiffPair {
  /** Stable identifier shown in the report (typically the URL path). */
  readonly path: string;
  /** Full URL of the baseline (MkDocs) page. */
  readonly baselineUrl: string;
  /** Full URL of the converted (Starlight) page. */
  readonly convertedUrl: string;
}

export interface PageDiffResult {
  readonly path: string;
  readonly status: PageDiffStatus;
  /**
   * Mismatched-pixel count. 0 for match; >0 for mismatch. Undefined when
   * the diff could not be computed (capture-failed, diff-failed).
   */
  readonly mismatchedPixels?: number;
  /** Total pixel count of the compared frame. */
  readonly totalPixels?: number;
  /** mismatchedPixels / totalPixels — only set when both are present. */
  readonly mismatchRatio?: number;
  /** Failure reason text when status is not `match` or `mismatch`. */
  readonly failureReason?: string;
}

export interface VisualDiffReport {
  readonly threshold: number;
  readonly results: ReadonlyArray<PageDiffResult>;
  readonly summary: VisualDiffSummary;
}

export interface VisualDiffSummary {
  readonly total: number;
  readonly matched: number;
  readonly mismatched: number;
  readonly captureFailed: number;
  readonly diffFailed: number;
}

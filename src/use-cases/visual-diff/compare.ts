/**
 * Visual diff use-case — compares pairs of pages between a baseline (MkDocs)
 * site and a converted (Starlight) site, returning a typed report.
 *
 * Pure given its ports: takes a `BrowserAutomator` for screenshots and an
 * `ImageDiffer` for pixel comparison. Tests inject fakes; production wires
 * Playwright + pixelmatch via `infrastructure/`.
 *
 * Contract:
 *   - Each input pair becomes one `PageDiffResult` in source order.
 *   - Capture failures collapse into `capture-failed` (the differ is not
 *     called for that pair).
 *   - Differ errors collapse into `diff-failed`.
 *   - A `match` decision uses `mismatchedPixels / totalPixels <= threshold`.
 *
 * The use-case never throws. Browser/Differ adapters that *do* throw should
 * be wrapped at the infrastructure boundary.
 */

import type { BrowserAutomator, CaptureOptions } from '../../domain/ports/browser-automator.js';
import type { ImageDiffer } from '../../domain/ports/image-differ.js';
import type {
  DiffPair,
  PageDiffResult,
  VisualDiffReport,
  VisualDiffSummary,
} from '../../domain/visual-diff/page-diff.js';

const DEFAULT_CAPTURE: CaptureOptions = {
  width: 1280,
  height: 800,
  timeoutMs: 30_000,
  fullPage: true,
};

export interface CompareSitesInput {
  readonly pairs: ReadonlyArray<DiffPair>;
  readonly browser: BrowserAutomator;
  readonly differ: ImageDiffer;
  readonly threshold: number;
  readonly captureOptions?: CaptureOptions;
}

export async function compareSites(input: CompareSitesInput): Promise<VisualDiffReport> {
  const captureOptions = input.captureOptions ?? DEFAULT_CAPTURE;
  const results: PageDiffResult[] = [];
  for (const pair of input.pairs) {
    results.push(await diffPair(pair, input, captureOptions));
  }
  return {
    threshold: input.threshold,
    results,
    summary: summarize(results),
  };
}

async function diffPair(
  pair: DiffPair,
  input: CompareSitesInput,
  captureOptions: CaptureOptions,
): Promise<PageDiffResult> {
  const baselineCapture = await input.browser.capture(pair.baselineUrl, captureOptions);
  if (!baselineCapture.ok) {
    return {
      path: pair.path,
      status: 'capture-failed',
      failureReason: `baseline capture failed for ${pair.baselineUrl}: ${baselineCapture.error.message}`,
    };
  }
  const convertedCapture = await input.browser.capture(pair.convertedUrl, captureOptions);
  if (!convertedCapture.ok) {
    return {
      path: pair.path,
      status: 'capture-failed',
      failureReason: `converted capture failed for ${pair.convertedUrl}: ${convertedCapture.error.message}`,
    };
  }
  const diff = await input.differ.diff(baselineCapture.value, convertedCapture.value);
  if (!diff.ok) {
    return {
      path: pair.path,
      status: 'diff-failed',
      failureReason: `image diff failed: ${diff.error.message}`,
    };
  }
  const totalPixels = diff.value.width * diff.value.height;
  const ratio = totalPixels === 0 ? 0 : diff.value.mismatchedPixels / totalPixels;
  return {
    path: pair.path,
    status: ratio <= input.threshold ? 'match' : 'mismatch',
    mismatchedPixels: diff.value.mismatchedPixels,
    totalPixels,
    mismatchRatio: ratio,
  };
}

function summarize(results: ReadonlyArray<PageDiffResult>): VisualDiffSummary {
  let matched = 0;
  let mismatched = 0;
  let captureFailed = 0;
  let diffFailed = 0;
  for (const r of results) {
    if (r.status === 'match') matched += 1;
    else if (r.status === 'mismatch') mismatched += 1;
    else if (r.status === 'capture-failed') captureFailed += 1;
    else if (r.status === 'diff-failed') diffFailed += 1;
  }
  return {
    total: results.length,
    matched,
    mismatched,
    captureFailed,
    diffFailed,
  };
}

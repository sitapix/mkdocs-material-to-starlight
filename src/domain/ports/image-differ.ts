/**
 * ImageDiffer port — compares two PNG images at the pixel level.
 *
 * Pure declaration: no I/O. Tests inject a fake that returns canned diff
 * stats; production uses the pixelmatch adapter from `infrastructure/image/`.
 *
 * Returns the mismatched-pixel count and the dimensions used for the diff.
 * Dimension mismatch between the two inputs is surfaced as an error rather
 * than silently resized — visual-diff is a precise tool, not a fuzzy one.
 */

import type { Result } from '../result.js';

export interface ImageDifferError {
  readonly code: 'driver-missing' | 'dimension-mismatch' | 'invalid-png' | 'unknown';
  readonly message: string;
}

export interface DiffStats {
  readonly mismatchedPixels: number;
  readonly width: number;
  readonly height: number;
}

export interface DiffOptions {
  /** Per-pixel match threshold passed to pixelmatch (0–1). Default 0.1. */
  readonly pixelThreshold?: number;
}

export interface ImageDiffer {
  diff(
    baseline: Uint8Array,
    converted: Uint8Array,
    options?: DiffOptions,
  ): Promise<Result<DiffStats, ImageDifferError>>;
}

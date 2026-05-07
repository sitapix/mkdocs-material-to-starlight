/**
 * BrowserAutomator port — captures a screenshot of a URL.
 *
 * Pure declaration: no I/O lives here. The use-case consumes the port as a
 * parameter; tests inject a fake that returns canned PNG bytes; production
 * uses the Playwright adapter from `infrastructure/browser/`.
 *
 * The image bytes are returned as a `Uint8Array` so this stays platform-
 * agnostic (no Node `Buffer` dependency at the domain layer).
 *
 * Failures are returned as `Result.err`, never thrown. Spawn-time and
 * navigation-time errors collapse into the same channel.
 */

import type { Result } from '../result.js';

export interface BrowserAutomatorError {
  readonly code: 'navigation-failed' | 'driver-missing' | 'timeout' | 'unknown';
  readonly url: string;
  readonly message: string;
}

export interface CaptureOptions {
  /** Viewport width in CSS pixels. */
  readonly width: number;
  /** Viewport height in CSS pixels. */
  readonly height: number;
  /** Hard page-load + capture timeout in milliseconds. */
  readonly timeoutMs: number;
  /** When true, capture the full scrollable page; when false, viewport only. */
  readonly fullPage: boolean;
}

export interface BrowserAutomator {
  capture(url: string, options: CaptureOptions): Promise<Result<Uint8Array, BrowserAutomatorError>>;
}

/**
 * Pick a "what's happening right now" message for the convert spinner based
 * on how long it's been running.
 *
 * The converter is opaque to the wizard. It returns a single Promise without
 * emitting phase events. Rather than a static message that goes stale during
 * a multi-minute run, we rotate through a fixed schedule of phase names.
 *
 * Thresholds match real observed timing: conversion itself usually finishes
 * in under a second, but `--check` runs `astro check` on the output, which
 * can take several minutes on first run (observed: ~5 min). The phase rotation
 * keeps the spinner line moving so a long check doesn't read as a hang. The
 * post-30s message extends a "still running" reassurance once we cross the
 * 90s mark so the user knows multi-minute waits are expected here.
 *
 * Thresholds aren't load-bearing. If a phase finishes faster, the next
 * threshold catches up.
 *
 * Pure: no I/O, no clock. Caller passes `elapsedMs`.
 */

export interface ConvertPhaseContext {
  /** True when `--check` is on (`astro check` is queued after conversion). */
  readonly withAstroCheck: boolean;
}

export function convertPhaseMessage(elapsedMs: number, ctx: ConvertPhaseContext): string {
  if (elapsedMs < 5_000) return 'Walking files…';
  if (elapsedMs < 15_000) return 'Transforming AST…';
  if (elapsedMs < 30_000) return 'Writing output…';
  if (!ctx.withAstroCheck) return 'Finalizing…';
  if (elapsedMs < 90_000) return 'Running `astro check`…';
  // Past 90s the spinner reads as a hang without reassurance. Reword to
  // tell the user a multi-minute wait is expected for first --check runs.
  return 'Running `astro check` (first runs can take a few minutes)…';
}

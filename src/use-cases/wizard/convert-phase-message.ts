/**
 * Pick a "what's happening right now" message for the convert spinner based
 * on how long it's been running.
 *
 * The converter is opaque to the wizard — it returns a single Promise without
 * emitting phase events. Rather than a static message that goes stale during
 * a 60-second `astro check`, we rotate through a fixed schedule of phase
 * names. The thresholds approximate observed phase durations for medium-size
 * sites; they're not load-bearing — if a phase finishes faster, the next
 * threshold catches up. The point is to keep the line *moving* so a long run
 * doesn't read as a hang.
 *
 * Pure: no I/O, no clock — caller passes `elapsedMs`.
 */

export interface ConvertPhaseContext {
  /** True when `--check` is on (`astro check` is queued after conversion). */
  readonly withAstroCheck: boolean;
}

export function convertPhaseMessage(elapsedMs: number, ctx: ConvertPhaseContext): string {
  if (elapsedMs < 5_000) return 'Walking files…';
  if (elapsedMs < 15_000) return 'Transforming AST…';
  if (elapsedMs < 30_000) return 'Writing output…';
  if (ctx.withAstroCheck) return 'Running `astro check` (slowest phase)…';
  return 'Finalizing…';
}

/**
 * Pick the description used in the wizard's lossy / manual / attention notes.
 *
 * Mapping rows carry two prose fields:
 *
 *   - `starlightOutput`: the canonical, fully-justified description used by
 *     `--explain`. It documents the contract for human readers and tends to
 *     run several clauses long.
 *   - `summary`: an optional one-liner (~80–100 chars) describing what the
 *     conversion *does*, with no rationale or named-loss tail. Used in the
 *     wizard pre-flight where the user is making a binary proceed/cancel
 *     decision and doesn't need the full essay.
 *
 * Empty-string `summary` falls back to `starlightOutput` so an inadvertently
 * blanked field never produces a silent bullet.
 */

import type { MappingRow } from './table.js';

export function attentionSummary(row: MappingRow): string {
  return row.summary && row.summary.length > 0 ? row.summary : row.starlightOutput;
}

/**
 * Normalize `pymdownx.progressbar` syntax (`[=85% "85%"]`, `[=1/2 "Half"]`)
 * into raw HTML `<progress>` elements.
 *
 * Material renders a styled `<div class="progress">...</div>` triplet;
 * Starlight has no equivalent, but HTML5 `<progress>` ships in every
 * browser without user CSS — good enough.
 *
 * Pure, fence-shielded, idempotent (the regex requires a `[=` sigil absent
 * from the emitted `<progress>` HTML).
 *
 * Limitations: `level_class`, `add_classes`, and the `{ : .candystripe }`
 * `attr_list` suffix are dropped.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

// [=<percent>%] | [=<percent>% "label"] | [=<num>/<den>] | [=<num>/<den> "label"]
// percent supports decimals; label is double-quoted.
const PROGRESS_RE = /\[=(\d+(?:\.\d+)?)(%|\/(\d+))(?:\s+"([^"]*)")?\]/g;

function clampPct(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return Math.floor(raw);
}

export function normalizeProgressBar(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    if (!PROGRESS_RE.test(line)) {
      PROGRESS_RE.lastIndex = 0;
      output.push(line);
      continue;
    }
    PROGRESS_RE.lastIndex = 0;
    output.push(
      line.replace(PROGRESS_RE, (_match, num, op, den, label) => {
        const numeric = Number(num);
        const value =
          op === '%'
            ? clampPct(numeric)
            : clampPct((numeric / Number(den)) * 100);
        const labelText = typeof label === 'string' ? label : '';
        return `<progress value="${value}" max="100">${labelText}</progress>`;
      }),
    );
  }
  return output.join('\n');
}

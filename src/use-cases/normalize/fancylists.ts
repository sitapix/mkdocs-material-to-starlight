/**
 * Normalize `pymdownx.fancylists` Roman and alpha ordered lists into raw
 * HTML `<ol type="…">` blocks.
 *
 * Markers: `i. ii. iii.` Roman, `a. b. c.` alpha; `I. II.` and `A.  B.`
 * uppercase (PyMdown requires two spaces after uppercase alpha to
 * disambiguate from initials). Without this pass, remark-parse turns each
 * marker into a decimal list item, dropping the `type` attribute.
 *
 * Pure, fence-shielded, idempotent (the marker regex requires line-start
 * `[a-zA-Z]+\. ` which emitted HTML lacks).
 *
 * Limitations: top-level lists only; multi-line continuation lines fold
 * into the preceding `<li>` only when they hold inline content (no complex
 * nesting); the `#.` generic marker is unhandled.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

type ListType = 'i' | 'I' | 'a' | 'A';
type Case = 'lower' | 'upper';
type Marker = { case: Case; marker: string; content: string };

const LOWER_MARKER = /^([a-z]+)\.\s+(.+)$/;
const UPPER_MARKER_TWOSP = /^([A-Z]+)\. {2,}(.+)$/;
const ROMAN_RE = /^[ivxlcdm]+$/i;

function parseMarker(line: string): Marker | null {
  const lo = LOWER_MARKER.exec(line);
  if (lo !== null) {
    return { case: 'lower', marker: lo[1] ?? '', content: lo[2] ?? '' };
  }
  const up = UPPER_MARKER_TWOSP.exec(line);
  if (up !== null) {
    return { case: 'upper', marker: up[1] ?? '', content: up[2] ?? '' };
  }
  return null;
}

function classifyRun(markers: ReadonlyArray<Marker>): ListType | null {
  if (markers.length < 2) return null;
  // All markers in the run must share case (otherwise it's two separate lists
  // per PyMdown semantics — we leave it unchanged).
  const c = markers[0]?.case;
  if (markers.some((m) => m.case !== c)) return null;
  // Roman vs alpha: if ANY marker is multi-letter and matches Roman shape,
  // classify the whole run as Roman (matching case). Otherwise it's alpha,
  // which only supports single-letter markers (multi-letter alpha is alpha
  // by accident — `aa.`, `ab.` — but those don't form lists in PyMdown).
  const anyMultiRoman = markers.some((m) => m.marker.length >= 2 && ROMAN_RE.test(m.marker));
  if (anyMultiRoman) {
    return c === 'lower' ? 'i' : 'I';
  }
  // Alpha: every marker must be a single letter.
  if (markers.every((m) => m.marker.length === 1)) {
    return c === 'lower' ? 'a' : 'A';
  }
  return null;
}

export function normalizeFancylists(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (isFenceLine(line)) {
      inFence = !inFence;
      output.push(line);
      i += 1;
      continue;
    }
    if (inFence) {
      output.push(line);
      i += 1;
      continue;
    }

    const first = parseMarker(line);
    if (first === null) {
      output.push(line);
      i += 1;
      continue;
    }

    const run: Marker[] = [first];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j] ?? '';
      const m = parseMarker(next);
      if (m === null || m.case !== first.case) break;
      run.push(m);
      j += 1;
    }

    const type = classifyRun(run);
    // Reject pure-decimal lists (parseMarker doesn't match digits) and
    // ambiguous mixed-marker runs — leave them untouched.
    if (type === null) {
      output.push(line);
      i += 1;
      continue;
    }

    output.push(`<ol type="${type}">`);
    for (const m of run) {
      output.push(`  <li>${m.content}</li>`);
    }
    output.push('</ol>');
    i = j;
  }
  return output.join('\n');
}

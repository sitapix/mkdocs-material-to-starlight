/**
 * Render a "card per row" list for the wizard's pre-convert notes (lossy
 * translations, manual remediations, plugins needing manual attention). Each
 * row gets a `• {name}` header line and the description on a separate
 * indented line, with a blank line between rows. This trades vertical space
 * for scannability — the previous "name — description" join produced
 * triple-em-dash sentences that read as a wall of prose.
 *
 * Pure: highlight functions are injected by the interface layer so the
 * formatter stays free of picocolors / ANSI dependencies.
 */

export interface AttentionRow {
  /** Plugin / feature identifier — highlighted to draw the eye. */
  readonly name: string;
  /** Free-form description (a sentence, or a docs URL). */
  readonly description: string;
}

export interface AttentionHighlighters {
  readonly name?: (text: string) => string;
  readonly description?: (text: string) => string;
}

const INDENT = '   ';

export function formatAttentionLines(
  rows: ReadonlyArray<AttentionRow>,
  highlighters: AttentionHighlighters = {},
): string {
  const hlName = highlighters.name ?? identity;
  const hlDesc = highlighters.description ?? identity;
  return rows
    .map((row) => `• ${hlName(row.name)}\n${INDENT}${hlDesc(row.description)}`)
    .join('\n\n');
}

function identity(text: string): string {
  return text;
}

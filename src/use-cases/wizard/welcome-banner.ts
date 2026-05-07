/**
 * The welcome banner shown at the top of the interactive wizard. Pure: takes
 * the Highlighter from the prompter port and returns the rendered string. The
 * caller pipes it to stdout.
 *
 * Why a tall banner: the wizard is the user's first impression of the
 * converter, and converting docs *should* feel a little magical. The banner
 * stacks five shower rows above the title with a sparse → medium → dense →
 * medium → dense gradient (so the title floats inside the brightest part of
 * the shower) plus two thin trailing rows below for falling-twinkle aftermath.
 * Glyphs are hand-placed and deterministic so the snapshot reads identically
 * on every run.
 *
 * Color discipline: every visible color goes through the Highlighter, never
 * picocolors directly. That keeps the use-case layer free of presentation
 * deps and lets tests assert plain text via the identity Highlighter. Every
 * shower row goes through `highlight.dim(...)` so sparkles fade behind the
 * bold-cyan title rather than competing with it.
 *
 * Glyphs (all stable across modern terminals — no exotic emoji that might
 * fall back to ?? in older fonts):
 *   - Frame:    ░▒▓ (U+2591/2/3 Block Element gradient), 🪄 (U+1FA84
 *               Magic Wand) — emoji presentation; falls back to a tofu box
 *               in pre-2020 terminals/fonts. The fallback is ugly but the
 *               banner still parses; we accept that tradeoff for the magic.
 *   - Sparkle:  · (U+00B7), ✦ (U+2726), ✧ (U+2727), ☆ (U+2606),
 *               ﾟ (U+FF9F halfwidth katakana semi-voiced sound mark — the
 *               classic Japanese-ASCII-art twinkle), 。 (U+3002 ideographic
 *               full stop), ｡ (U+FF61 halfwidth variant), o, *, +, .
 */

import type { Highlighter } from '../../domain/wizard/ports/prompter.js';

const SHADE_LEFT = '░▒▓';
const SHADE_RIGHT = '▓▒░';
// Five hand-tuned shower rows (sparse → medium → dense → dense → densest)
// stacked above the title for a depth gradient — the title appears to float
// inside the brightest band of stars. Deterministic; no RNG.
const STAR_SHOWER_ROWS_ABOVE: ReadonlyArray<string> = [
  '              ﾟ                       ☆                       ﾟ',
  '       .            ﾟ              ✦                ﾟ              .',
  '   ﾟ      ·      ｡      ﾟ      ☆      ✧      ﾟ      ·      ﾟ      ｡',
  '  ☆  ﾟ   *   ﾟ   .   ﾟ   ✦   ﾟ   o   ﾟ   ｡   ﾟ   *   ﾟ  ☆   ﾟ  ·   ﾟ',
  ' ﾟ · ﾟ ✦ ﾟ ｡ ﾟ + ﾟ * ﾟ ☆ ﾟ ✧ ﾟ · ﾟ o ﾟ ☆ ﾟ + ﾟ . ﾟ ✦ ﾟ ｡ ﾟ',
];
// Two trailing rows below the tagline — sparse, like a few twinkles trailing
// past the title before the rail starts.
const STAR_SHOWER_ROWS_BELOW: ReadonlyArray<string> = [
  '       ﾟ      .       ﾟ            ｡       ﾟ          ☆       ﾟ',
  '              ﾟ                +                ﾟ',
];

export function welcomeBanner(highlight: Highlighter): string {
  const source = highlight.name('mkdocs-material');
  const target = highlight.name('astro-starlight');
  // 🪄 instead of an arrow: this is the wizard, after all. The emoji is two
  // columns wide so the title row is slightly asymmetric with the shaded
  // blocks, but the row isn't column-aligned with anything else — fine.
  const wand = highlight.value('🪄');
  return [
    '',
    ...STAR_SHOWER_ROWS_ABOVE.map((row) => highlight.dim(row)),
    `   ${SHADE_LEFT}  ${source}  ${wand}  ${target}  ${SHADE_RIGHT}`,
    '       Convert MkDocs Material docs to Astro Starlight',
    ...STAR_SHOWER_ROWS_BELOW.map((row) => highlight.dim(row)),
    '',
    '',
  ].join('\n');
}

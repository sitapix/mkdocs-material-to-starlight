/**
 * Translate GitHub-flavored `:shortcode:` emoji into Unicode glyphs.
 *
 * Material's `pymdownx.emoji` resolves shortcodes at build time; Astro has
 * no equivalent so the shortcode renders as literal text. Uses `gemoji`
 * (1900+ entries, the data behind GitHub's renderer) so coverage matches
 * `api.github.com/emojis`.
 *
 * Icon-set prefixes (`material-`, `fontawesome-`, `octicons-`, `simple-`,
 * `lucide-`) are preserved for the icons transform.
 *
 * Pure, fence-shielded, inline-code-shielded. The matcher accepts `_` and
 * `\_` so shortcodes survive remark-stringify table escaping.
 *
 * GitHub-custom emojis without Unicode (`:octocat:`, `:shipit:`, ...) pass
 * through; users can hand-port to `<img>` if needed.
 */

import { nameToEmoji } from 'gemoji';
import { STARLIGHT_ICON_NAMES } from '../transform/icon-mappings.js';

const FENCED_CODE_PATTERN = /(```[\s\S]*?```)/g;
const INLINE_CODE_PATTERN = /(`[^`\n]*`)/g;
// Match `:name:` where name contains letters, digits, plus/hyphen, and either
// raw `_` or backslash-escaped `\_`. The escaped form appears after
// remark-stringify processes a markdown table cell or other context where
// underscores are CommonMark-significant. Without this tolerance, shortcodes
// that survived remark-stringify with escapes (`:red\_circle:`) would fail
// to match here and render as literal text in the final output.
const SHORTCODE_PATTERN = /:((?:[a-z0-9+\-]|_|\\_)+):/g;
const ICON_PREFIX_PATTERN = /^(material|fontawesome|octicons|simple|lucide|fa)-/;

// Manual overrides for shortcodes that `gemoji` doesn't ship under the
// alias real-world docs use. `gemoji` IS the canonical GitHub data, so the
// override list is now tiny — only Material-specific aliases that gemoji
// genuinely doesn't recognize. Manual entries win over the library lookup.
const EMOJI_OVERRIDES: ReadonlyMap<string, string> = new Map(
  Object.entries({
    // Material themes occasionally use these aliases that aren't in gemoji:
    rocket_emoji: '🚀', // some Material themes prefer this over plain `:rocket:`
    mouse_two: '🖱️', // disambiguates from `:mouse:` (animal)
  }),
);

export function normalizeStandardEmoji(source: string): string {
  return splitPreserving(source, FENCED_CODE_PATTERN)
    .map((part) => {
      if (FENCED_CODE_PATTERN.test(part)) return part;
      return splitPreserving(part, INLINE_CODE_PATTERN)
        .map((p) => (INLINE_CODE_PATTERN.test(p) ? p : replaceInPart(p)))
        .join('');
    })
    .join('');
}

function replaceInPart(part: string): string {
  return part.replace(SHORTCODE_PATTERN, (match, rawName: string) => {
    // Normalize the captured name: strip backslash escapes that
    // remark-stringify inserts before underscores (`red\_circle` → `red_circle`).
    // Lookups always use the canonical raw form.
    const name = rawName.replace(/\\_/g, '_');
    if (ICON_PREFIX_PATTERN.test(name)) return match;
    // Resolution order:
    //   1. Manual overrides (small set of forced mappings)
    //   2. gemoji (canonical GitHub emoji data, ~1900 entries)
    //   3. Starlight icon set — emit `<Icon name="..." />` JSX. When the
    //      bare shortcode happens to match a Starlight icon name (e.g.
    //      `:bitbucket:`, `:cloud-download:`, `:mastodon:`, `:discord:`),
    //      this gives users a real rendered icon instead of literal text.
    //      The mdx-detection step sees the `<Icon>` tag, promotes the
    //      file to .mdx, and auto-injects the Icon import.
    //   4. Pass through verbatim — for GitHub-custom emojis (`:octocat:`,
    //      `:trollface:`, `:shipit:`) and genuinely unknown shortcodes.
    const override = EMOJI_OVERRIDES.get(name);
    if (override !== undefined) return override;
    const fromLibrary = nameToEmoji[name];
    if (fromLibrary !== undefined) return fromLibrary;
    if (STARLIGHT_ICON_NAMES.has(name)) {
      // Tag with `sl-inline-icon` so the converter's CSS shim keeps the
      // icon inline. Starlight's markdown.css applies `display: block` to
      // every `<svg>` inside `.sl-markdown-content`; the shim CSS rule
      // restores inline-block via higher-specificity / unlayered cascade.
      // See `transform/ast/icons.ts:makeIconHtml` and the shim in
      // `serialize-config/styles.ts` for the matching CSS.
      return `<Icon name="${name}" class="sl-inline-icon" />`;
    }
    return match;
  });
}

function splitPreserving(source: string, pattern: RegExp): string[] {
  const parts: string[] = [];
  let cursor = 0;
  const local = new RegExp(pattern.source, pattern.flags);
  let m: RegExpExecArray | null = local.exec(source);
  while (m !== null) {
    if (m.index > cursor) parts.push(source.slice(cursor, m.index));
    parts.push(m[0]);
    cursor = m.index + m[0].length;
    m = local.exec(source);
  }
  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}

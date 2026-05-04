/**
 * Scanner: detect Material-specific frontmatter fields that don't translate
 * 1:1 to Starlight conventions and surface a per-occurrence diagnostic so
 * users see them in MIGRATION_NOTES.md.
 *
 * Covers two clusters of fields:
 *
 *   1. **Search controls** (`search.boost`, `search.exclude`) — Material's
 *      Lunr index supports per-page boosting and exclusion. Pagefind has
 *      analogous primitives (`pagefind: false`, ranking weight) but the
 *      conversion is not 1:1, so the converter prefers an explicit
 *      diagnostic over silent translation.
 *
 *   2. **Blog post fields** that `starlight-blog` does not honor as-is
 *      (`categories`, `pin`, `links`). Material's blog plugin treats these
 *      as first-class; `starlight-blog` only natively supports `tags`,
 *      `authors`, `date`, `draft`, `excerpt`, and `cover`. The diagnostics
 *      tell users which fields they need to either rename, drop, or
 *      reproduce manually.
 *
 * Pure read (no text mutation). Operates only on the leading `---`-delimited
 * YAML block; later occurrences of these keys (in body prose) do not fire.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const SEARCH_BOOST_RE = /^[ \t]*search:[\s\S]*?^[ \t]+boost:[ \t]+\S+/m;
const SEARCH_EXCLUDE_RE = /^[ \t]*search:[\s\S]*?^[ \t]+exclude:[ \t]+true/m;
const CATEGORIES_BLOCK_RE = /^[ \t]*categories:[ \t]*(?:\n[ \t]+-|\[)/m;
const PIN_RE = /^[ \t]*pin:[ \t]+(?:true|false)[ \t]*$/m;
const LINKS_BLOCK_RE = /^[ \t]*links:[ \t]*(?:\n[ \t]+-|\[)/m;
const SOCIAL_BLOCK_RE = /^[ \t]*social:[ \t]*\n[ \t]+(?:cards|cards_layout|cards_layout_options)\b/m;

export function scanFrontmatterFields(source: string): ReadonlyArray<Diagnostic> {
  const fmMatch = source.match(FRONTMATTER_RE);
  if (fmMatch === null) return [];
  const yaml = fmMatch[1] ?? '';

  const out: Diagnostic[] = [];
  if (SEARCH_BOOST_RE.test(yaml)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'frontmatter-search-boost',
        source: 'normalize/scan-frontmatter-fields',
        message:
          'Frontmatter `search.boost: <number>` detected. Material\'s Lunr-based search uses this as a per-page rank multiplier. Starlight\'s default Pagefind has no boost frontmatter; ranking is configured in `astro.config` via the `pagefind` option (e.g. `weight`, `sort`) at the site level, or by adding `data-pagefind-weight` attributes inside the page body. The boost frontmatter is dropped on conversion.',
      }),
    );
  }
  if (SEARCH_EXCLUDE_RE.test(yaml)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'frontmatter-search-exclude',
        source: 'normalize/scan-frontmatter-fields',
        message:
          'Frontmatter `search.exclude: true` detected. Material\'s Lunr search excludes the page from the index. Starlight\'s Pagefind equivalent is `pagefind: false` at the page frontmatter level (or `data-pagefind-ignore` inside the page body for sub-page exclusion). Replace the Material `search:` block with `pagefind: false` to preserve behaviour.',
      }),
    );
  }
  if (CATEGORIES_BLOCK_RE.test(yaml)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'frontmatter-blog-categories',
        source: 'normalize/scan-frontmatter-fields',
        message:
          'Frontmatter `categories:` detected — Material blog plugin\'s thematic grouping field. `starlight-blog` does not have a separate categories taxonomy; everything is unified under `tags:`. Either move category names into `tags:` (the converter does not auto-merge) or accept that the categories field will pass through as opaque YAML.',
      }),
    );
  }
  if (PIN_RE.test(yaml)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'frontmatter-blog-pin',
        source: 'normalize/scan-frontmatter-fields',
        message:
          'Frontmatter `pin: true|false` detected — Material blog plugin\'s feature for pinning a post to the top of index pages. `starlight-blog` does not honor this field. To reproduce the behaviour, set `featured: true` on the post (a `starlight-blog` convention rendered in the sidebar) or use the post `date` field to control ordering.',
      }),
    );
  }
  if (LINKS_BLOCK_RE.test(yaml)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'frontmatter-blog-links',
        source: 'normalize/scan-frontmatter-fields',
        message:
          'Frontmatter `links:` detected — Material blog plugin\'s related-reading list rendered in the post sidebar. `starlight-blog` has no equivalent. Reproduce by adding the links manually inside the post body (e.g. inside an "## Related" heading) or build a small Astro component that reads a `related:` frontmatter field via `getEntry()`.',
      }),
    );
  }
  if (SOCIAL_BLOCK_RE.test(yaml)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'frontmatter-social-cards',
        source: 'normalize/scan-frontmatter-fields',
        message:
          'Frontmatter `social:` block (`cards`, `cards_layout`, `cards_layout_options`) detected — Material\'s per-page social-card override. The converter auto-wires `astro-og-canvas` for OG image generation, but per-page customisation works differently: edit the generator endpoint at `src/pages/og/[...slug].png.ts` and branch on the page slug or frontmatter, or skip OG generation per page by returning a 404 from that endpoint when frontmatter says so. The `cards_layout_options` (background_color, font_family, etc.) must be hand-ported into the og-canvas configuration.',
      }),
    );
  }
  return out;
}

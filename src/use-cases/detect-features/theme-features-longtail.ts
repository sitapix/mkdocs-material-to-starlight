/**
 * Detect `theme.features` flags in the long-tail — flags that are NOT
 * already handled by the primary classifier in
 * `domain/starlight/theme-feature-catalog.ts` — and return per-flag
 * recommendation entries.
 *
 * The returned entries drive per-flag `info` diagnostics emitted in the
 * interface shell (`interface/api/convert-site.ts`). Each entry carries
 * the Starlight approximation text so the diagnostic message is actionable.
 *
 * Pure function: takes the features array from theme.options, returns readonly
 * entries. No I/O, no side effects.
 *
 * DESIGN: The primary classifier in `domain/starlight/theme-feature-catalog.ts`
 * handles the well-known flags (navigation.tabs, content.code.copy, etc.) with
 * generic `theme-feature-replaced` / `theme-feature-unsupported` diagnostics.
 * This detector covers ADDITIONAL long-tail flags that (a) are not in the
 * primary catalog, or (b) are in the catalog but we provide richer
 * recommendation text here. The runtime skip (via `classifyThemeFeature`)
 * prevents double-emit for flags already handled by the primary classifier.
 */

import { classifyThemeFeature } from '../../domain/starlight/theme-feature-catalog.js';

export interface LongtailEntry {
  readonly flag: string;
  readonly recommendation: string;
}

/**
 * Long-tail flags with rich Starlight approximation text.
 *
 * Flags that ARE in the primary catalog will be filtered out at runtime by
 * the `detectLongtailFeatures` function (via `classifyThemeFeature`), so
 * including them here causes no double-emit. The map serves as documentation
 * for all known approximations.
 */
const LONGTAIL: ReadonlyMap<string, string> = new Map([
  [
    'navigation.instant',
    'Use Astro view transitions: add `<ClientRouter />` from `astro:transitions` to your root layout, or enable the `@astrojs/transitions` integration.',
  ],
  [
    'navigation.instant.preview',
    'Astro view transitions support hover-prefetch via `<a data-astro-prefetch="hover">`. Add this attribute to relevant links in layout overrides.',
  ],
  [
    'navigation.path',
    'Starlight has built-in breadcrumbs via the `starlight-breadcrumbs` community plugin; enable with `breadcrumbs: true` in your starlight() config integration options.',
  ],
  [
    'navigation.prune',
    'Use `sidebar` group `collapsed: true` to hide unused branches. There is no single global prune flag in Starlight; apply per group.',
  ],
  [
    'navigation.footer',
    'Starlight emits prev/next footer links by default — no config change needed. Toggle via `pagination: false` in frontmatter or the global starlight config.',
  ],
  [
    'navigation.tracking',
    'Starlight tracks the active heading in the URL anchor by default. No action needed.',
  ],
  [
    'navigation.expand',
    'Material Insiders feature. Starlight equivalent: set sidebar group `collapsed: false` per group in astro.config.mjs.',
  ],
  [
    'navigation.sections.expand',
    'Material Insiders feature. Same as navigation.expand: set sidebar group `collapsed: false` per group.',
  ],
  [
    'toc.follow',
    'Starlight default behavior — the sticky scroll-tracked ToC is always on. No action needed.',
  ],
  [
    'toc.integrate',
    'Set `tableOfContents: false` in frontmatter and customize the sidebar to include ToC entries. There is no first-class Starlight equivalent for inline ToC.',
  ],
  [
    'header.autohide',
    'No first-class Starlight equivalent. Override `Header.astro` to add a scroll-direction listener that toggles `display: none` on the header.',
  ],
  [
    'announce.dismiss',
    '`starlight-announcement` covers this — dismissible announcement banners with optional scheduling. Auto-installed; configure title/message in `astro.config.mjs`.',
  ],
  [
    'content.action.edit',
    'Starlight emits an "Edit page" link automatically when `editLink.baseUrl` is configured in astro.config.mjs.',
  ],
  [
    'content.action.view',
    '`starlight-page-actions` covers this — adds a "View source" page-action button. Auto-installed; configure the source link in `astro.config.mjs`.',
  ],
  [
    'content.tooltips',
    'No first-class Starlight equivalent. Add custom CSS on `<a title>` links and use Markdown attribute lists for hover tooltips.',
  ],
  [
    'content.footnote.tooltips',
    'No first-class Starlight equivalent. Add a small client-side script for footnote hover preview, or use a third-party tooltip library.',
  ],
  [
    'content.code.select',
    'Starlight uses Expressive Code which supports full-block copy; selection-aware copy is not a first-class feature. The default copy button covers the common case.',
  ],
]);

/**
 * Return one entry per long-tail flag found in `features` that is not already
 * handled by the primary classifier. Already-handled flags are excluded to
 * prevent double-emit.
 */
export function detectLongtailFeatures(
  features: ReadonlyArray<string>,
): ReadonlyArray<LongtailEntry> {
  const out: LongtailEntry[] = [];
  for (const flag of features) {
    // Skip flags already handled by the primary classifier (any classification
    // other than null means it's in the catalog and will get its own diagnostic).
    if (classifyThemeFeature(flag) !== null) continue;
    const recommendation = LONGTAIL.get(flag);
    if (recommendation === undefined) continue;
    out.push({ flag, recommendation });
  }
  return out;
}

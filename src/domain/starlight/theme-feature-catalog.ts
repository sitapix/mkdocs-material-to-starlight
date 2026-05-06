/**
 * Catalog of Material `theme.features` flags and how each relates to Starlight.
 *
 * Three buckets:
 *   - `replaced-by-default`: Starlight (or Pagefind / ExpressiveCode) already
 *     does the equivalent thing. Migration emits an info diagnostic to
 *     confirm the feature was seen.
 *   - `unsupported`: no Starlight equivalent. Migration emits a warning with
 *     a remediation note pointing at component overrides.
 *   - `handled-elsewhere`: another part of the converter already covers it
 *     (e.g. `content.action.edit` rides the repo_url + edit_uri pipeline).
 *     Returned so the caller skips it without double-emitting.
 *
 * Pure data plus a single lookup. Unknown identifiers return null; the
 * caller surfaces those as a generic "unknown feature" warning.
 */

type ThemeFeatureKind = 'replaced-by-default' | 'unsupported' | 'handled-elsewhere';

export interface ThemeFeatureClassification {
  readonly kind: ThemeFeatureKind;
  readonly note: string;
}

const CATALOG: ReadonlyMap<string, ThemeFeatureClassification> = new Map(
  Object.entries({
    // ── Starlight default-on equivalents ────────────────────────────────────
    'navigation.indexes': {
      kind: 'replaced-by-default',
      note: 'Section index pages are reordered automatically when the mkdocs-section-index plugin is detected; manual sidebar group ordering achieves the same effect otherwise.',
    },
    'navigation.tracking': {
      kind: 'replaced-by-default',
      note: 'Starlight tracks the active heading in the URL anchor by default.',
    },
    'navigation.sections': {
      kind: 'replaced-by-default',
      note: 'Top-level sidebar groups always render as section headers in Starlight.',
    },
    'navigation.path': {
      kind: 'replaced-by-default',
      note: 'Breadcrumbs are not built into Starlight today; this feature is acknowledged but no UI is generated. Install the `starlight-breadcrumbs` community plugin for parity.',
    },
    'navigation.instant': {
      kind: 'replaced-by-default',
      note: 'For SPA-style navigation, enable Astro view transitions by adding `<ClientRouter />` from `astro:transitions` to your layout.',
    },
    'navigation.instant.prefetch': {
      kind: 'replaced-by-default',
      note: 'Astro prefetches links in viewport by default when prefetch is enabled.',
    },
    'navigation.instant.progress': {
      kind: 'replaced-by-default',
      note: 'Astro view transitions handle the loading indicator; no separate progress bar is generated.',
    },
    'navigation.footer': {
      kind: 'replaced-by-default',
      note: 'Prev/next pagination is rendered at the foot of every page by default; toggle via the `pagination` starlight config option.',
    },
    'toc.follow': {
      kind: 'replaced-by-default',
      note: 'The Starlight table of contents already auto-scrolls to follow the active heading.',
    },
    'content.code.copy': {
      kind: 'replaced-by-default',
      note: "ExpressiveCode (Starlight's code block renderer) ships a copy-to-clipboard button by default.",
    },
    'content.code.select': {
      kind: 'replaced-by-default',
      note: 'Code blocks are user-selectable by default; no special markup is needed.',
    },
    'content.code.annotate': {
      kind: 'replaced-by-default',
      note: 'Code annotations are converted by the dedicated annotations pipeline (see the `code-annotations` mapping row).',
    },
    'search.highlight': {
      kind: 'replaced-by-default',
      note: 'Pagefind highlights matched terms in result snippets by default.',
    },
    'search.suggest': {
      kind: 'replaced-by-default',
      note: "Pagefind's built-in UI shows query suggestions as the user types.",
    },

    // ── No Starlight equivalent — emit a warning ────────────────────────────
    'navigation.expand': {
      kind: 'unsupported',
      note: 'Starlight sidebar groups support per-group `collapsed: true/false` but cannot be globally forced expanded. Set `collapsed: false` on each group manually if needed.',
    },
    'navigation.prune': {
      kind: 'unsupported',
      note: 'Starlight always renders the full sidebar tree. Pruning to the current branch requires a custom Sidebar.astro override.',
    },
    'navigation.top': {
      kind: 'unsupported',
      note: 'No built-in "back to top" button. The community plugin `starlight-scroll-to-top` (frostybee/starlight-scroll-to-top) reproduces this UX with one line of config in `astro.config`. Otherwise, drop in a small floating `<a href="#_top">` via a custom component override.',
    },
    'toc.integrate': {
      kind: 'unsupported',
      note: 'Starlight always renders the table of contents in the right rail, never inline within the page. Override PageSidebar.astro to emulate the inline placement.',
    },
    'header.autohide': {
      kind: 'unsupported',
      note: 'The Starlight header is always pinned. Reimplement scroll-aware hiding via a custom Header.astro override with a small client-side script.',
    },
    'content.action.view': {
      kind: 'unsupported',
      note: 'Starlight has only `editLink`, not a separate "view source" link. Add one manually in a Footer.astro or PageTitle.astro override.',
    },
    'content.tooltips': {
      kind: 'unsupported',
      note: 'No built-in tooltip-on-link feature. Abbreviations are converted via the dedicated `abbreviations` pipeline; custom hover tooltips need component overrides.',
    },
    'content.footnote.tooltips': {
      kind: 'unsupported',
      note: 'Material 9.7 added hover tooltips for footnote references (`[^1]`). Starlight has no built-in footnote tooltip — footnotes render as plain in-page anchors via remark-gfm. Reproduce by adding a small client-side script that listens for hover on `a[href^="#user-content-fn-"]` and renders a popover from the corresponding `li[id^="user-content-fn-"]` element. Or accept that footnotes are click-to-jump only.',
    },
    'announce.dismiss': {
      kind: 'unsupported',
      note: 'The starlight `banner` is always shown to all visitors. Implement dismiss by adding a client-side script to a Banner.astro override that toggles localStorage.',
    },
    'search.share': {
      kind: 'unsupported',
      note: 'Pagefind does not encode the active query into the URL. Reimplement via a Search.astro override that updates window.location on input.',
    },

    // ── Handled elsewhere — caller skips to avoid double-emit ───────────────
    'navigation.tabs': {
      kind: 'handled-elsewhere',
      note: 'Surfaced by `feature-navigation-tabs-recommend-topics`.',
    },
    'navigation.tabs.sticky': {
      kind: 'handled-elsewhere',
      note: 'Same recommendation as `navigation.tabs`.',
    },
    'content.tabs.link': {
      kind: 'handled-elsewhere',
      note: 'Surfaced by `feature-tabs-link-detected`.',
    },
    'content.action.edit': {
      kind: 'handled-elsewhere',
      note: 'Mapped to starlight `editLink` from the `repo_url` + `edit_uri` keys.',
    },
    // NOTE: Material 9.7 "stay on page when switching languages" is NOT a
    // theme.features flag — verified against the Material docs (the feature
    // is automatic when `extra.alternate` is set). No catalog entry needed.
  }) as ReadonlyArray<[string, ThemeFeatureClassification]>,
);

export function classifyThemeFeature(feature: string): ThemeFeatureClassification | null {
  return CATALOG.get(feature) ?? null;
}

/**
 * Detect Material for MkDocs *Insiders*-only features in `mkdocs.yml`.
 *
 * Material has a paid Insiders tier. Configs are commonly shared between
 * Insiders and non-Insiders sites (because they are forked from public
 * templates), so unrecognized Insiders flags often appear in real
 * `mkdocs.yml` files even when the site is not actually built with Insiders.
 *
 * The converter cannot reproduce Insiders features (they are not part of the
 * public Material distribution). The closest the converter can do is name
 * each Insiders feature explicitly so the user has a structured record of
 * what their config asks for vs. what the open-source converter can deliver.
 *
 * The detector returns one entry per detected Insiders flag/plugin. The
 * interface shell maps each entry to a `material-insiders-feature-detected`
 * info diagnostic. This is INDEPENDENT of the longtail/diagnose-plugins
 * detectors — those provide Starlight approximations; this one provides the
 * Insiders labeling. A single feature can produce both diagnostics; the
 * Insiders one carries the "this requires a paid Material subscription"
 * signal that grep/CI workflows can filter on.
 *
 * Pure function: takes config slices, returns readonly entries. No I/O.
 */

export type InsidersKind = 'theme-feature' | 'plugin';

export interface InsidersEntry {
  /** The flag name (for theme-feature) or plugin name (for plugin). */
  readonly feature: string;
  /** Whether this entry came from `theme.features` or `plugins:`. */
  readonly kind: InsidersKind;
  /** Short human explanation of why the feature is flagged Insiders. */
  readonly rationale: string;
}

/**
 * Theme-feature flags that are documented as Material Insiders-only at the
 * time this list was built. Some flags may have moved to public Material in
 * later releases; if so, the diagnostic gives the user enough context to
 * recognize the false-positive case.
 */
const INSIDERS_THEME_FEATURES: ReadonlyMap<string, string> = new Map([
  [
    'navigation.expand',
    'Material Insiders feature — auto-expand all sidebar groups on initial load. The public converter cannot reproduce this; closest Starlight equivalent is per-group `collapsed: false` in the sidebar config.',
  ],
  [
    'navigation.sections.expand',
    'Material Insiders feature — expand all sections by default. Closest Starlight equivalent is per-group `collapsed: false`.',
  ],
  [
    'navigation.prune',
    'Material Insiders feature — render only the active branch of the navigation tree. The public converter cannot reproduce this; closest Starlight equivalent is per-group `collapsed: true` paired with manual sidebar curation.',
  ],
  [
    'navigation.instant.progress',
    'Material Insiders feature — top-of-page loading indicator during instant navigation. No first-class Starlight equivalent; Astro view transitions emit lifecycle events you can hook into manually.',
  ],
  [
    'navigation.path',
    'Material Insiders feature — breadcrumb above page title. Starlight has the `starlight-breadcrumbs` community plugin that approximates this.',
  ],
  [
    'navigation.tabs.sticky',
    'Material Insiders feature — sticky top tabs that remain visible while scrolling. No first-class Starlight equivalent; replicate via custom `Header.astro` and CSS `position: sticky`.',
  ],
  [
    'navigation.indexes.disabled',
    'Material Insiders extension to `navigation.indexes` — selectively disable section index pages. Not part of public Material; manage manually via your sidebar config.',
  ],
  [
    'header.autohide',
    'Material Insiders feature — hide the header when scrolling down. No first-class Starlight equivalent; override `Header.astro` with a scroll-direction listener.',
  ],
  [
    'announce.dismiss',
    'Material Insiders feature — dismissible announcement banner. Starlight equivalent: `starlight-announcement` (auto-installed by the converter when this flag is detected) provides dismissible banners with optional scheduling.',
  ],
  [
    'content.tooltips',
    'Material Insiders feature — custom-styled hover tooltips. No first-class Starlight equivalent; CSS-only approximation via `<a title>` styling.',
  ],
  [
    'content.footnote.tooltips',
    'Material Insiders feature — hover preview for footnote references. No first-class Starlight equivalent; needs a small client-side script or third-party tooltip library.',
  ],
  [
    'content.code.select',
    'Material Insiders feature — selection-aware copy for code blocks. Starlight uses Expressive Code with full-block copy; per-selection copy is not first-class.',
  ],
  [
    'content.action.view',
    'Material Insiders feature — "View source" page action. Starlight equivalent: `starlight-page-actions` (auto-installed by the converter when this flag is detected) provides page-action buttons.',
  ],
]);

/**
 * Plugin names that are documented as Material Insiders-only at the time this
 * list was built. The plugin diagnostics in `diagnose-plugins.ts` already
 * surface a Starlight-equivalent recommendation for each; this list adds the
 * extra Insiders labeling.
 */
const INSIDERS_PLUGINS: ReadonlyMap<string, string> = new Map([
  [
    'meta',
    'Material Insiders plugin — folder-scoped frontmatter cascade via `.meta.yml`. The public converter cannot reproduce this; closest path is to inline the cascade values into each page\'s frontmatter or extend `docsSchema()` manually.',
  ],
  [
    'optimize',
    'Material Insiders plugin — image-asset optimization at build time. Astro\'s built-in `astro:assets` / sharp pipeline subsumes this on the Astro side.',
  ],
  [
    'privacy',
    'Material Insiders plugin — self-host external assets at build time. No first-class Astro equivalent; replicate via a custom rehype plugin paired with a build-time fetcher.',
  ],
  [
    'typeset',
    'Material Insiders plugin — rich nav/TOC formatting. Starlight\'s sidebar accepts plain strings only; nav formatting is intentionally lost in the migration.',
  ],
  [
    'projects',
    'Material Insiders plugin — multi-site monorepo support. No first-class Astro equivalent; use Turbo or Nx workspaces with separate Astro configs.',
  ],
  [
    'group',
    'Material Insiders plugin — conditional plugin grouping. No first-class Astro equivalent; use `process.env` checks inside `astro.config.mjs` to gate integrations.',
  ],
]);

export interface DetectInsidersInput {
  readonly themeFeatures: ReadonlyArray<string>;
  readonly pluginNames: ReadonlyArray<string>;
}

export function detectInsidersFeatures(input: DetectInsidersInput): ReadonlyArray<InsidersEntry> {
  const out: InsidersEntry[] = [];
  const seen = new Set<string>();

  for (const flag of input.themeFeatures) {
    const rationale = INSIDERS_THEME_FEATURES.get(flag);
    if (rationale === undefined) continue;
    const key = `theme-feature:${flag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ feature: flag, kind: 'theme-feature', rationale });
  }

  for (const name of input.pluginNames) {
    const rationale = INSIDERS_PLUGINS.get(name);
    if (rationale === undefined) continue;
    const key = `plugin:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ feature: name, kind: 'plugin', rationale });
  }

  return out;
}

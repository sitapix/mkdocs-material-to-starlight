/**
 * Single source of truth for every dependency version the converter pins
 * into a generated `package.json`.
 *
 * Why this file exists: every entry here gets baked into a real user's
 * project. If they sit untouched for a year, every fresh conversion
 * installs a stale set of packages and generates `ERESOLVE` errors when
 * peer-dep ranges drift. Centralising them here means one obvious place
 * to look during a periodic refresh, and a single git diff per refresh.
 *
 * The two-part structure (`CORE_VERSIONS` + `FEATURE_DEPENDENCIES`) is
 * deliberate: the core block always ships, the feature block only adds
 * entries when the corresponding feature is detected in the source. Keep
 * them apart so the impact of a version bump is local.
 */

/**
 * Stable identifier for a feature whose presence in the source pulls
 * extra dependencies into the generated `package.json`. Each value
 * matches a `featureId` in the conversion-mapping table so the
 * registration stays auditable from one place.
 */
export type DetectedFeature =
  | 'math'
  | 'mermaid'
  | 'image-zoom'
  | 'versions'
  | 'blog'
  | 'tags'
  | 'last-updated'
  | 'rss'
  | 'package-managers'
  | 'swagger-ui'
  | 'kbd'
  | 'github-alerts'
  | 'announcement'
  | 'page-actions'
  | 'og-cards'
  | 'heading-badges'
  | 'contributor-list';

export const CORE_VERSIONS = {
  // Pinned to 0.34+ — Starlight 0.30/0.31 had a sidebar slug-resolution
  // bug that rejected every `{ slug: 'foo' }` entry at `astro build`
  // even when the .md file existed. Fixed in 0.34. Bumped from 0.34 to
  // 0.38 because several auto-installed companion plugins (e.g.
  // starlight-kbd 0.4.0) pin `@astrojs/starlight@>=0.38.0` as a peer.
  starlight: '^0.38.0',
  // Bumped to match Starlight 0.38's peer dep `astro@^6.0.0`. Starlight
  // pins the major Astro version; mismatch raises `ERESOLVE` on install.
  astro: '^6.0.0',
  // Biome 2.3+ supports `.astro` (HTML/CSS/JS/TS sub-blocks) plus the
  // rest of the Astro/Starlight scaffold (.mjs, .ts, .json, .css). Baked
  // in as a devDep so `npm run format` works the moment users
  // `npm install`. Markdown/MDX is intentionally NOT formatted by Biome
  // — those go through remark-stringify in the converter.
  biome: '^2.3.0',
  // Image processing dep used by Astro and Starlight assets pipeline.
  sharp: '^0.33.0',
  // Default-on link-validation plugin, run on every build.
  starlightLinksValidator: '^0.24.0',
  // Default-on AI-assistant accessibility — generates llms.txt /
  // llms-full.txt / llms-small.txt automatically from Starlight content
  // with no per-site config needed.
  starlightLlmsTxt: '^0.8.0',
} as const;

/**
 * Feature-specific dependency lists. Each detected feature maps to zero
 * or more `[name, version]` pairs that get added to the generated
 * `package.json`'s `dependencies` block.
 */
export const FEATURE_DEPENDENCIES: Readonly<
  Record<DetectedFeature, ReadonlyArray<readonly [string, string]>>
> = {
  math: [
    ['remark-math', '^6.0.0'],
    ['rehype-katex', '^7.0.0'],
    // Pin `katex` directly so the `katex/dist/katex.min.css` import that
    // astro.config wires into customCss resolves on a fresh install.
    // rehype-katex pulls it in transitively, but pinning makes the path
    // stable across version bumps.
    ['katex', '^0.16.11'],
  ],
  mermaid: [['astro-mermaid', '^1.0.0']],
  'image-zoom': [['starlight-image-zoom', '^0.14.0']],
  // `mike` (versioned docs) → `starlight-versions`, plus
  // `starlight-changelogs` so users can publish changelog entries
  // between versions. Gap-analysis (2026-05-03) recommends bundling
  // them: users running mike almost always want release notes alongside
  // the version switcher.
  versions: [
    ['starlight-versions', '^0.8.0'],
    ['starlight-changelogs', '^0.5.0'],
  ],
  blog: [['starlight-blog', '^0.26.0']],
  tags: [['starlight-tags', '^1.0.0']],
  // last-updated is a Starlight built-in (`lastUpdated: true`) — no extra deps.
  'last-updated': [],
  rss: [['@astrojs/rss', '^4.0.0']],
  'package-managers': [['starlight-package-managers', '^0.12.0']],
  'swagger-ui': [['starlight-openapi', '^0.25.0']],
  // pymdownx.keys (`++ctrl+alt+del++`) → starlight-kbd. The plugin
  // styles plain `<kbd>` tags via injected CSS so existing emitted HTML
  // keeps working — installing the dep is the value-add.
  kbd: [['starlight-kbd', '^0.4.0']],
  // GitHub-style `> [!NOTE]` blockquote alerts → starlight-github-alerts.
  // Detected from source scan; the plugin transforms the alert syntax
  // into Starlight asides at build time.
  'github-alerts': [['starlight-github-alerts', '^0.2.0']],
  // Material `theme.features: [announce.dismiss]` (Insiders flag) →
  // starlight-announcement. Provides dismissible banners with optional
  // scheduling.
  announcement: [['starlight-announcement', '^1.1.0']],
  // Material `theme.features: [content.action.view]` →
  // starlight-page-actions. Adds page-action buttons (View source, etc.).
  'page-actions': [['starlight-page-actions', '^0.6.0']],
  // Material `social` plugin (per-page OG card PNGs) → astro-og-canvas.
  // The canonical Starlight pattern (HiDeoo guides, 2026) is to mount
  // an Astro endpoint that calls `OGImageRoute` from astro-og-canvas.
  // Distinct from Starlight's `social: []` header config.
  'og-cards': [['astro-og-canvas', '^0.11.0']],
  // ATX headings with `attr_list` classes (`## Title { .badge }`)
  // detected by `scan-heading-badges` → `starlight-heading-badges`. The
  // plugin renders the class as an inline Badge next to the heading
  // text, recreating Material's heading-badge idiom.
  'heading-badges': [['starlight-heading-badges', '^0.5.0']],
  // `mkdocs-git-authors-plugin` and `mkdocs-git-committers-2` (per-page
  // git contributors) → `starlight-contributor-list`. Starlight has no
  // first-party per-page contributor block; this community plugin gives
  // a project-wide footer list. The converter cannot auto-extract git
  // log contributors here (no git port), so the integration emits a
  // placeholder `list: []` the user fills in.
  'contributor-list': [['starlight-contributor-list', '^0.5.0']],
};

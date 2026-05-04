/**
 * Serialize a `package.json` for the generated Starlight project.
 *
 * Pure: takes the migrated site config, returns the JSON file content. The
 * package name is derived from the site title (slugified to kebab-case);
 * non-alphabetic titles fall back to `starlight-docs`.
 *
 * Dependency versions are pinned to caret ranges so users can run
 * `npm install` and pull the latest patch. The script set mirrors what
 * `npm create astro@latest -- --template starlight` ships, so the project
 * feels like a normal Astro repo from day one.
 */

// Pinned to 0.34+ — Starlight 0.30/0.31 have a sidebar slug-resolution bug
// that rejects every `{ slug: 'foo' }` entry at `astro build` even when the
// .md file exists. Fixed in 0.34.
// Bumped from 0.34 to 0.38: several auto-installed companion plugins
// pin `@astrojs/starlight@>=0.38.0` as a peer dep (e.g. starlight-kbd
// 0.4.0). Under-pinning here triggers `ERESOLVE` on `npm install`.
const STARLIGHT_VERSION = '^0.38.0';
// Bumped to match Starlight 0.38's peer dep `astro@^6.0.0`. Starlight pins
// the major Astro version; mismatch raises an `ERESOLVE` install failure.
const ASTRO_VERSION = '^6.0.0';

/**
 * Stable identifier for a feature whose presence in the source pulls extra
 * dependencies into the generated `package.json`. Each value matches a
 * `featureId` in the conversion-mapping table (`domain/conversion-mapping/
 * table.ts`) so the registration is auditable from one place.
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
  | 'og-cards';

export interface PackageJsonInput {
  readonly siteName: string;
  readonly siteDescription: string | null;
  readonly detectedFeatures?: ReadonlyArray<DetectedFeature>;
  /** Extra npm package names (and optional version specs) to include as deps.
   *  Used today for Fontsource packages derived from `theme.font`; when no
   *  version is provided, `latest` is pinned. */
  readonly extraDependencies?: ReadonlyArray<readonly [string, string]>;
  /** Explicit package name override. When set, used directly instead of
   *  slugifying the site name. */
  readonly packageName?: string;
}

const FEATURE_DEPENDENCIES: Readonly<Record<DetectedFeature, ReadonlyArray<readonly [string, string]>>> = {
  math: [
    ['remark-math', '^6.0.0'],
    ['rehype-katex', '^7.0.0'],
  ],
  mermaid: [['astro-mermaid', '^1.0.0']],
  'image-zoom': [['starlight-image-zoom', '^0.14.0']],
  // `mike` (versioned docs) → `starlight-versions`, plus `starlight-changelogs`
  // as a companion so users can publish changelog entries between versions.
  // Gap-analysis (2026-05-03) recommends bundling them: users running mike
  // almost always want to surface release notes alongside the version switcher.
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
  // pymdownx.keys (`++ctrl+alt+del++`) → starlight-kbd. The plugin styles
  // plain `<kbd>` tags via injected CSS so existing emitted HTML keeps
  // working — installing the dep is the value-add.
  kbd: [['starlight-kbd', '^0.4.0']],
  // GitHub-style `> [!NOTE]` blockquote alerts → starlight-github-alerts.
  // Detected from source scan; the plugin transforms the alert syntax into
  // Starlight asides at build time.
  'github-alerts': [['starlight-github-alerts', '^0.2.0']],
  // Material `theme.features: [announce.dismiss]` (Insiders flag) →
  // starlight-announcement. Provides dismissible banners with optional
  // scheduling — first-class equivalent that the original audit missed.
  announcement: [['starlight-announcement', '^1.1.0']],
  // Material `theme.features: [content.action.view]` → starlight-page-actions.
  // Adds page-action buttons (View source, etc.) — first-class equivalent
  // that the original audit missed.
  'page-actions': [['starlight-page-actions', '^0.6.0']],
  // Material `social` plugin (per-page OG card PNGs) → astro-og-canvas. There
  // is no `starlight-*` plugin for this; the canonical Starlight pattern
  // (HiDeoo guides, 2026) is to mount an Astro endpoint that calls
  // `OGImageRoute` from astro-og-canvas. Distinct from Starlight's `social: []`
  // header config (icon links to social-media accounts), which is wired
  // separately from `extra.social[]` in mkdocs.yml.
  'og-cards': [['astro-og-canvas', '^0.11.0']],
};

export function serializePackageJson(input: PackageJsonInput): string {
  const name = input.packageName !== undefined ? input.packageName : slugify(input.siteName);
  const pkg: Record<string, unknown> = {
    name,
    type: 'module',
    version: '0.0.1',
    private: true,
  };
  if (input.siteDescription !== null) {
    pkg.description = input.siteDescription;
  }
  pkg.scripts = {
    dev: 'astro dev',
    start: 'astro dev',
    build: 'astro build',
    preview: 'astro preview',
    astro: 'astro',
  };
  const dependencies: Record<string, string> = {
    astro: ASTRO_VERSION,
    '@astrojs/starlight': STARLIGHT_VERSION,
    sharp: '^0.33.0',
    'starlight-links-validator': '^0.24.0',
    // Default-on AI-assistant accessibility — generates llms.txt /
    // llms-full.txt / llms-small.txt automatically from Starlight content with
    // no per-site config needed. Gap-analysis (2026-05-03) recommends bundling.
    'starlight-llms-txt': '^0.8.0',
  };
  for (const feature of input.detectedFeatures ?? []) {
    for (const [name, version] of FEATURE_DEPENDENCIES[feature]) {
      dependencies[name] = version;
    }
  }
  for (const [name, version] of input.extraDependencies ?? []) {
    dependencies[name] = version;
  }
  pkg.dependencies = dependencies;
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function slugify(value: string): string {
  const stripped = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stripped.length === 0 ? 'starlight-docs' : stripped;
}

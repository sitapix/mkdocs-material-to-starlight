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
const STARLIGHT_VERSION = '^0.34.0';
const ASTRO_VERSION = '^5.0.0';

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
  | 'rss';

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
  'image-zoom': [['starlight-image-zoom', '^0.10.0']],
  versions: [['starlight-versions', '^0.7.0']],
  blog: [['starlight-blog', '^0.20.0']],
  tags: [['starlight-tags', '^0.5.0']],
  // last-updated is a Starlight built-in (`lastUpdated: true`) — no extra deps.
  'last-updated': [],
  rss: [['@astrojs/rss', '^4.0.0']],
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
    'starlight-links-validator': '^0.18.0',
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

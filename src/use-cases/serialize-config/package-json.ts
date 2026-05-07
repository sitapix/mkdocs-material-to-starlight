/**
 * Serialize a `package.json` for the generated Starlight project.
 *
 * Pure: takes the migrated site config, returns the JSON file content.
 * The package name is derived from the site title (slugified to
 * kebab-case); non-alphabetic titles fall back to `starlight-docs`.
 *
 * Every pinned version (Astro, Starlight, Biome, feature plugins) lives
 * in `versions.ts` so a periodic refresh touches one file. The script
 * set mirrors what `npm create astro@latest -- --template starlight`
 * ships, plus the Biome scripts so users can run `npm run format`
 * the moment they `npm install`.
 */

import { CORE_VERSIONS, type DetectedFeature, FEATURE_DEPENDENCIES } from './versions.js';

export type { DetectedFeature };

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
    // Biome covers .astro/.mjs/.ts/.json/.css. Markdown/MDX is left as-is
    // (Biome has no Markdown parser); the converter already serializes
    // those through remark-stringify.
    format: 'biome format --write .',
    'format:check': 'biome format .',
    lint: 'biome lint .',
    'lint:fix': 'biome lint --write .',
    check: 'biome check .',
    'check:fix': 'biome check --write .',
  };
  const dependencies: Record<string, string> = {
    astro: CORE_VERSIONS.astro,
    '@astrojs/starlight': CORE_VERSIONS.starlight,
    sharp: CORE_VERSIONS.sharp,
    'starlight-links-validator': CORE_VERSIONS.starlightLinksValidator,
    'starlight-llms-txt': CORE_VERSIONS.starlightLlmsTxt,
  };
  for (const feature of input.detectedFeatures ?? []) {
    for (const [pkgName, version] of FEATURE_DEPENDENCIES[feature]) {
      dependencies[pkgName] = version;
    }
  }
  for (const [pkgName, version] of input.extraDependencies ?? []) {
    dependencies[pkgName] = version;
  }
  pkg.dependencies = dependencies;
  pkg.devDependencies = {
    '@biomejs/biome': CORE_VERSIONS.biome,
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function slugify(value: string): string {
  const stripped = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return stripped.length === 0 ? 'starlight-docs' : stripped;
}

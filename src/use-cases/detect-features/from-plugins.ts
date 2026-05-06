/**
 * Detect features from a parsed `mkdocs.yml` plugin list and Markdown
 * extension list.
 *
 * Plugin-driven Starlight integrations:
 *   mkdocs-glightbox → starlight-image-zoom
 *   mike             → starlight-versions
 *
 * Extension-driven:
 *   pymdownx.keys    → starlight-kbd
 *
 * Parallel to `detect-features/detect.ts` (which scans source). Both
 * produce `DetectedFeature` and the site-level orchestrator unions them.
 * Adding a mapping is one line in PLUGIN_TO_FEATURE. Pure.
 */

import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';
import type { DetectedFeature } from '../serialize-config/package-json.js';

const PLUGIN_TO_FEATURE: ReadonlyMap<string, DetectedFeature> = new Map([
  // mkdocs-glightbox is registered in mkdocs.yml as `glightbox`.
  ['glightbox', 'image-zoom'] as const,
  // The mike versioning plugin registers as `mike`.
  ['mike', 'versions'] as const,
  // Material's first-party `blog` plugin → `starlight-blog`.
  ['blog', 'blog'] as const,
  // Material's first-party `tags` plugin → `starlight-tags`.
  ['tags', 'tags'] as const,
  // mkdocs-git-revision-date-localized → Starlight's built-in lastUpdated.
  ['git-revision-date-localized', 'last-updated'] as const,
  // mkdocs-rss-plugin → @astrojs/rss endpoint scaffold.
  ['rss', 'rss'] as const,
  // mkdocs-mermaid2-plugin → astro-mermaid (alternative to superfences mermaid path).
  ['mermaid2', 'mermaid'] as const,
  // mkdocs-swagger-ui-tag → starlight-openapi.
  ['mkdocs-swagger-ui-tag', 'swagger-ui'] as const,
  ['swagger-ui-tag', 'swagger-ui'] as const,
  // pymdownx.keys → starlight-kbd. Same map, since it's a name → feature
  // lookup and extensions are passed through the same iteration as plugins.
  ['pymdownx.keys', 'kbd'] as const,
  // Material `social` plugin (per-page OG card PNGs) → astro-og-canvas.
  // No `starlight-*` plugin exists for this; the canonical Starlight pattern
  // (HiDeoo guides, 2026) installs astro-og-canvas and mounts an Astro
  // endpoint via `OGImageRoute`. Note: this is NOT Starlight's `social: []`
  // header config (icon links to social-media accounts) — that one is wired
  // separately from `extra.social[]` in mkdocs.yml.
  ['social', 'og-cards'] as const,
  // `mkdocs-git-authors-plugin` and `mkdocs-git-committers-2` →
  // `starlight-contributor-list` (HiDeoo). Both register under different
  // names in mkdocs.yml but share the same Starlight target — installing
  // either triggers the same plugin install + integration emission.
  ['git-authors', 'contributor-list'] as const,
  ['git-committers', 'contributor-list'] as const,
]);

export function detectFeaturesFromPlugins(
  plugins: ReadonlyArray<MkdocsPlugin>,
  extensions: ReadonlyArray<{ readonly name: string }> = [],
): ReadonlySet<DetectedFeature> {
  const out = new Set<DetectedFeature>();
  for (const item of [...plugins, ...extensions]) {
    const feature = PLUGIN_TO_FEATURE.get(item.name);
    if (feature !== undefined) {
      out.add(feature);
    }
  }
  return out;
}

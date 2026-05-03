/**
 * Detect features from a parsed `mkdocs.yml` plugin list.
 *
 * Some Starlight integrations are driven by plugin presence in the source
 * `mkdocs.yml`, not by syntax in Markdown source files. Examples:
 *
 *   mkdocs-glightbox  → starlight-image-zoom (click-to-zoom for images)
 *   mike              → starlight-versions   (versioned doc trees)
 *
 * This use-case is the parallel of `detect-features/detect.ts` (which scans
 * source) — they produce the same `DetectedFeature` union and the site-level
 * orchestrator takes the union of both. Pure: takes a plugin list, returns a
 * `Set<DetectedFeature>`.
 *
 * Adding a new plugin → feature mapping is one line in PLUGIN_TO_FEATURE.
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
]);

export function detectFeaturesFromPlugins(
  plugins: ReadonlyArray<MkdocsPlugin>,
): ReadonlySet<DetectedFeature> {
  const out = new Set<DetectedFeature>();
  for (const plugin of plugins) {
    const feature = PLUGIN_TO_FEATURE.get(plugin.name);
    if (feature !== undefined) {
      out.add(feature);
    }
  }
  return out;
}

import type { DetectedFeature } from './versions.js';

/**
 * Features implemented by packages maintained outside Astro/Starlight.
 *
 * Detection still records these features and produces migration guidance, but
 * the converter does not silently add their packages or configuration. A
 * caller must explicitly enable one before it is passed to the serializers.
 */
const THIRD_PARTY_PLUGIN_FEATURES: ReadonlySet<DetectedFeature> = new Set([
  'math',
  'mermaid',
  'image-zoom',
  'versions',
  'blog',
  'tags',
  'package-managers',
  'swagger-ui',
  'kbd',
  'github-alerts',
  'announcement',
  'page-actions',
  'og-cards',
  'heading-badges',
  'sidebar-topics',
  'scroll-to-top',
  'giscus',
  'd2',
  'auto-drafts',
  'base-path',
]);

export function applyThirdPartyPluginPolicy(
  detectedFeatures: ReadonlyArray<DetectedFeature>,
  explicitlyEnabled: ReadonlySet<DetectedFeature> = new Set(),
): ReadonlyArray<DetectedFeature> {
  return detectedFeatures.filter(
    (feature) => !THIRD_PARTY_PLUGIN_FEATURES.has(feature) || explicitlyEnabled.has(feature),
  );
}

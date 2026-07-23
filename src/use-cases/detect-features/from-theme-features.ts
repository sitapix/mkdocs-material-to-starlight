/**
 * Detect Starlight community-plugin features driven by `theme.features` flags
 * in `mkdocs.yml`.
 *
 * Some Material `theme.features` entries have first-class Starlight community
 * plugins as equivalents (the original 2026-05-03 audit missed several of
 * these). This detector returns the corresponding `DetectedFeature` values so
 * the package.json + astro.config scaffolders auto-install and wire them.
 *
 *   announce.dismiss     → starlight-announcement (dismissible banners)
 *   content.action.view  → starlight-page-actions (View source button)
 *
 * Pure function: takes the features array, returns a set. No I/O.
 */

import type { DetectedFeature } from '../serialize-config/package-json.js';

const FLAG_TO_FEATURE: ReadonlyMap<string, DetectedFeature> = new Map([
  ['announce.dismiss', 'announcement'] as const,
  ['content.action.view', 'page-actions'] as const,
  // Material's header tabs (top-level nav sections as tabs) → per-topic
  // sidebars. The interface layer filters this out when the user passed
  // `--no-sidebar-topics`.
  ['navigation.tabs', 'sidebar-topics'] as const,
  // Material's back-to-top button. Zero-config plugin equivalent.
  ['navigation.top', 'scroll-to-top'] as const,
]);

export function detectFeaturesFromThemeFeatures(
  themeFeatures: ReadonlyArray<string>,
): ReadonlySet<DetectedFeature> {
  const out = new Set<DetectedFeature>();
  for (const flag of themeFeatures) {
    const feature = FLAG_TO_FEATURE.get(flag);
    if (feature !== undefined) out.add(feature);
  }
  return out;
}

/**
 * Compute the set of Tier 1 prompts that should fire based on detected
 * features in the mkdocs config and the explain pre-pass.
 *
 * Pure: input is a ConversionPlan, output is an ordered list of trigger tags.
 * The orchestrator iterates this list and dispatches to the corresponding
 * prompt builder.
 */

import type { ConversionPlan } from '../../domain/wizard/plan.js';

export type Tier1Trigger =
  | 'tabs'
  | 'sidebar-topics'
  | 'snippets'
  | 'rss'
  | 'i18n'
  | 'mike'
  | 'palette'
  | 'extra-assets';

const ORDER: ReadonlyArray<Tier1Trigger> = [
  'tabs',
  'sidebar-topics',
  'snippets',
  'rss',
  'i18n',
  'mike',
  'palette',
  'extra-assets',
];

export function triggerSet(plan: ConversionPlan): ReadonlyArray<Tier1Trigger> {
  const themeFeatures = collectThemeFeatures(plan);
  const pluginNames = new Set(plan.config.plugins.map((p) => p.name));
  const extensionNames = new Set(plan.config.markdownExtensions.map((e) => e.name));

  const fired = new Set<Tier1Trigger>();
  if (themeFeatures.includes('content.tabs.link')) fired.add('tabs');
  if (themeFeatures.includes('navigation.tabs')) fired.add('sidebar-topics');
  if (extensionNames.has('pymdownx.snippets')) fired.add('snippets');
  if (pluginNames.has('rss')) fired.add('rss');
  if (pluginNames.has('i18n')) fired.add('i18n');
  if (pluginNames.has('mike')) fired.add('mike');
  if (
    plan.config.theme?.options &&
    'palette' in plan.config.theme.options &&
    plan.config.theme.options.palette !== undefined &&
    plan.config.theme.options.palette !== null
  ) {
    fired.add('palette');
  }
  if (plan.detectedExtraCss.length > 0 || plan.detectedExtraJs.length > 0) {
    fired.add('extra-assets');
  }

  return ORDER.filter((t) => fired.has(t));
}

function collectThemeFeatures(plan: ConversionPlan): ReadonlyArray<string> {
  const f = plan.config.theme?.options.features;
  return Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : [];
}

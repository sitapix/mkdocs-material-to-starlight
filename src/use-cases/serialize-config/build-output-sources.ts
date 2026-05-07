/**
 * Build the conditional output sources the orchestrator hands to
 * `writeOutputs`: the stylesheet shim, the optional RSS endpoint, the
 * optional OG-cards endpoint, the optional `tags.yml` stub, and the
 * `preserveSlugs` flag derived from the site-conversion diagnostics.
 *
 * Pure: every input is already-computed data; outputs are strings or
 * booleans. Pulled out of `interface/api/convert-site.ts` so the
 * orchestrator stays under the size budget.
 */

import type { MaterialFontConfig } from '../../domain/starlight/font-mapping.js';
import type { PaletteStrategy, StarlightPalette } from '../../domain/starlight/palette-mapping.js';
import type { TaggedDiagnostic } from '../convert-site/convert.js';
import { serializeOgEndpoint } from './og-endpoint.js';
import { serializeRssEndpoint } from './rss-endpoint.js';
import { serializeStyleSheet } from './styles.js';
import type { DetectedFeature } from './versions.js';

const TAGS_YML_STUB =
  '# starlight-tags configuration. Each tag must declare a `label` (display\n' +
  '# name); other fields (description, color, icon, permalink, etc.) are\n' +
  '# optional. Tag IDs must be lowercase letters/digits/hyphens/underscores.\n' +
  '# See https://frostybee.github.io/starlight-tags/ for the full schema.\n' +
  'tags:\n' +
  '  example:\n' +
  '    label: Example\n' +
  '    description: An example tag — replace with your own definitions.\n';

export interface BuildOutputSourcesInput {
  readonly siteName: string;
  readonly siteDescription: string | null;
  readonly siteUrl: string | null;
  readonly palette: StarlightPalette | null;
  readonly paletteStrategy: PaletteStrategy | undefined;
  readonly themeFonts: MaterialFontConfig | null | undefined;
  readonly detectedFeatures: ReadonlyArray<DetectedFeature>;
  readonly socialCardsLayoutOptions: Readonly<Record<string, unknown>> | undefined;
  /** Tri-state: false=disable, true=enable-when-possible, undefined=auto-detect from features. */
  readonly rssOption: boolean | undefined;
  /** All per-file diagnostics from `convertSite`; we mine `slug-incompatible-path`
   * to flip on Starlight 0.35's `docsLoader({ generateId })` override. */
  readonly siteDiagnostics: ReadonlyArray<TaggedDiagnostic>;
}

export interface BuildOutputSourcesResult {
  readonly stylesheetSource: string;
  readonly rssEndpointSource: string | null;
  readonly ogEndpointSource: string | null;
  readonly tagsYmlSource: string | null;
  readonly preserveSlugs: boolean;
}

export function buildOutputSources(input: BuildOutputSourcesInput): BuildOutputSourcesResult {
  const stylesheetSource = serializeStyleSheet(
    input.palette,
    input.themeFonts ?? null,
    input.paletteStrategy,
  );

  // RSS endpoint requires a parseable absolute `site:` URL — `@astrojs/rss`
  // crashes the build with "Invalid input: expected string, received
  // undefined (site)" when site is missing or invalid. The same gate that
  // suppresses `site:` for non-URL-shaped values (Python YAML tags,
  // env-var placeholders) must disable RSS too.
  const isValidSiteUrl =
    input.siteUrl !== null &&
    /^https?:\/\//i.test(input.siteUrl) &&
    (() => {
      try {
        return Boolean(new URL(input.siteUrl ?? ''));
      } catch {
        return false;
      }
    })();
  const rssEnabled =
    input.rssOption === false
      ? false
      : input.rssOption === true
        ? isValidSiteUrl
        : input.detectedFeatures.includes('rss') && isValidSiteUrl;
  const rssEndpointSource = rssEnabled
    ? serializeRssEndpoint({
        siteName: input.siteName,
        siteDescription: input.siteDescription,
        siteUrl: input.siteUrl,
      })
    : null;

  const ogEndpointSource = input.detectedFeatures.includes('og-cards')
    ? serializeOgEndpoint({
        siteName: input.siteName,
        ...(input.socialCardsLayoutOptions !== undefined
          ? { cardsLayoutOptions: input.socialCardsLayoutOptions }
          : {}),
      })
    : null;

  // starlight-tags 1.0+ requires a `tags.yml` at the project root listing
  // every tag the site uses. Material's tags plugin doesn't carry this
  // structure; emit a minimal stub the user can extend.
  const tagsYmlSource = input.detectedFeatures.includes('tags') ? TAGS_YML_STUB : null;

  // Auto-apply Starlight 0.35+'s `docsLoader({ generateId })` when any
  // source path has segments github-slugger would reshape. Replaces the
  // historic `slug-incompatible-path` warning with a real fix: the
  // emitted content.config.ts overrides the default sluggifier so paths
  // like `1.0/configuration.md` and `c++-primer.md` resolve verbatim.
  const preserveSlugs = input.siteDiagnostics.some(
    (d) => d.diagnostic.ruleId === 'slug-incompatible-path',
  );

  return {
    stylesheetSource,
    rssEndpointSource,
    ogEndpointSource,
    tagsYmlSource,
    preserveSlugs,
  };
}

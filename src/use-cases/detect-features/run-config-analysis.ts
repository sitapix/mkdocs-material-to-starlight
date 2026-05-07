/**
 * Run every config-level analysis the orchestrator needs in one pass.
 * Combines:
 *
 *   1. Detection: palette, themeFonts, redirects, expressiveCodeConfig,
 *      analytics, i18n, social, editLinkBaseUrl, tableOfContents,
 *      extraAssets — every "what does the source declare" extractor
 *      whose output the astro-config + package-json assembly consumes.
 *
 *   2. Diagnostics: every config-derived diagnostic stream
 *      (plugin-level, palette, hooks, theme-features, longtail,
 *      insiders, python-tags, expressive-code, theme-language,
 *      analytics, theme-fonts, deferred-wizard, extra-warnings,
 *      auto-discovery, include-markdown-applied, plus the
 *      bulk-source-scan stream).
 *
 * Pulled out of `interface/api/convert-site.ts` so the orchestrator
 * stays under the size budget. Async because the hooks-classifier and
 * bulk-scan phase read source files via the FileSystem port.
 */

import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { mapAnalyticsToHeadEntries } from '../../domain/starlight/analytics-mapping.js';
import {
  mapMaterialPaletteToStarlight,
  type StarlightPalette,
} from '../../domain/starlight/palette-mapping.js';
import type { TaggedDiagnostic } from '../convert-site/convert.js';
import { buildDeferredWizardDiagnostics } from '../convert-site/wizard-decision-diagnostics.js';
import { type DirectoryReaderLike, runBulkScans } from '../scan-occurrences/run-bulk-scans.js';
import { diagnoseAnalytics } from './diagnose-analytics.js';
import { diagnoseExpressiveCode } from './diagnose-expressive-code.js';
import { diagnoseHooks, extractHookPaths } from './diagnose-hooks.js';
import { diagnosePalette } from './diagnose-palette.js';
import { diagnosePlugins } from './diagnose-plugins.js';
import { diagnoseThemeFeatures } from './diagnose-theme-features.js';
import { diagnoseThemeFonts } from './diagnose-theme-fonts.js';
import { diagnoseThemeLanguage } from './diagnose-theme-language.js';
import { deriveEditLinkBaseUrl } from './edit-link.js';
import { extractExpressiveCodeConfig } from './expressive-code-config.js';
import { extractAlternateLocales } from './extra-alternate.js';
import { extractExtraAssets } from './extra-assets.js';
import { detectExtraWarnings } from './extra-warnings.js';
import { extractI18nConfig, type I18nConfig } from './i18n-config.js';
import { detectInsidersFeatures } from './insiders-features.js';
import { extractRedirects } from './redirects.js';
import { extractSocial } from './social.js';
import { detectLongtailFeatures } from './theme-features-longtail.js';
import { extractThemeFonts } from './theme-fonts.js';
import { extractThemeLanguage } from './theme-language.js';
import { extractTocConfig } from './toc-config.js';

const SOURCE = 'mkdocs-material-to-starlight';

type AnalyticsResult = ReturnType<typeof mapAnalyticsToHeadEntries>;
type SocialList = ReturnType<typeof extractSocial>;
type RedirectMap = ReturnType<typeof extractRedirects>;
type ToCConfig = ReturnType<typeof extractTocConfig>;
type ThemeFontsResult = ReturnType<typeof extractThemeFonts>;
type ExtraAssetsResult = ReturnType<typeof extractExtraAssets>;
type ExpressiveCodeResult = ReturnType<typeof extractExpressiveCodeConfig>;

export interface RunConfigAnalysisInput {
  readonly config: MkdocsConfig;
  readonly fs: FileSystem;
  readonly dirReader: DirectoryReaderLike;
  readonly projectDir: string;
  readonly docsDir: string;
  readonly sourcePaths: ReadonlyArray<string>;
  readonly themeFeatures: ReadonlyArray<string>;
  readonly hasTabsLink: boolean;
  readonly hasNavigationTabs: boolean;
  readonly includeMarkdownEnabled: boolean;
  readonly strippedPythonTags: ReadonlyArray<string>;
  readonly autoDiscovery: { readonly fromDir: string; readonly discoveredRelPath: string } | null;
  /** Diagnostics from earlier orchestrator phases (plugin-level, sidebar-
   * compile, literate-nav). Folded into the output's `allDiagnostics` so
   * the orchestrator no longer has to do the array-spread itself. */
  readonly precomputedDiagnostics: ReadonlyArray<TaggedDiagnostic>;
  /** The deferred-wizard input bag (mikeVersions, palette, etc. that
   * weren't applied yet). Passed through verbatim to
   * buildDeferredWizardDiagnostics. */
  readonly deferredInput: Parameters<typeof buildDeferredWizardDiagnostics>[0];
}

export interface ConfigDetections {
  readonly palette: StarlightPalette | null;
  readonly themeFonts: ThemeFontsResult;
  readonly redirects: RedirectMap;
  readonly expressiveCodeConfig: ExpressiveCodeResult;
  readonly analytics: AnalyticsResult;
  readonly i18n: I18nConfig | null;
  readonly social: SocialList;
  readonly editLinkBaseUrl: string | null;
  readonly tableOfContents: ToCConfig;
  readonly extraAssets: ExtraAssetsResult;
}

export interface ConfigAnalysisResult {
  readonly allDiagnostics: ReadonlyArray<TaggedDiagnostic>;
  readonly detected: ConfigDetections;
}

export async function runConfigAnalysis(
  input: RunConfigAnalysisInput,
): Promise<ConfigAnalysisResult> {
  const { config } = input;

  // Detection pass — the "what does the source declare" extractors.
  const palette = mapMaterialPaletteToStarlight(config.theme?.options.palette ?? null);
  const paletteRaw = config.theme?.options.palette;
  const paletteSpecified = paletteRaw !== undefined && paletteRaw !== null;
  const themeFonts = extractThemeFonts(config.theme?.options ?? {});
  const redirects = extractRedirects(config.plugins);
  const expressiveCodeConfig = extractExpressiveCodeConfig(config.markdownExtensions);
  const analytics = mapAnalyticsToHeadEntries(config.extras);

  const i18nFromPlugin = extractI18nConfig(config.plugins);
  const i18nFromAlternate = i18nFromPlugin === null ? extractAlternateLocales(config.extras) : null;
  const themeLanguage =
    i18nFromPlugin === null && i18nFromAlternate === null
      ? extractThemeLanguage(config.theme?.options ?? {})
      : undefined;
  const i18nFromThemeLanguage =
    themeLanguage === undefined
      ? null
      : {
          defaultLocale: themeLanguage.code,
          locales: [{ code: themeLanguage.code, label: themeLanguage.label, isDefault: true }],
        };
  const i18n = i18nFromPlugin ?? i18nFromAlternate ?? i18nFromThemeLanguage;

  const social = extractSocial(config.extras);
  const editLinkBaseUrl = deriveEditLinkBaseUrl(config.repoUrl, config.editUri);
  const tableOfContents = extractTocConfig(config.markdownExtensions);
  const extraAssets = extractExtraAssets(config.extras);

  // Diagnostic pass — every config-derived stream, ordered to match the
  // pre-extraction inline implementation so MIGRATION_NOTES.md ordering
  // doesn't drift.
  const includeMarkdownAppliedDiagnostic = input.includeMarkdownEnabled
    ? [
        {
          sourcePath: 'mkdocs.yml',
          diagnostic: createDiagnostic({
            severity: 'info' as const,
            ruleId: 'plugin-include-markdown-applied',
            source: SOURCE,
            message:
              'mkdocs-include-markdown-plugin: `{% include %}` and `{% include-markdown %}` directives have been resolved inline before per-file conversion.',
          }),
        },
      ]
    : [];

  const paletteDiagnostics = diagnosePalette(palette, paletteSpecified);
  const hookDiagnostics = await diagnoseHooks({
    projectDir: input.projectDir,
    fs: input.fs,
    hookPaths: extractHookPaths(config.extras),
  });
  const themeFeatureDiagnostics = diagnoseThemeFeatures({
    hasTabsLink: input.hasTabsLink,
    hasNavigationTabs: input.hasNavigationTabs,
    themeFeatures: input.themeFeatures,
    copyright: config.copyright,
    repoUrl: config.repoUrl,
    repoName: config.repoName,
    themeOptions: config.theme?.options ?? {},
  });

  const longtailEntries = detectLongtailFeatures(input.themeFeatures);
  const longtailDiagnostics: ReadonlyArray<TaggedDiagnostic> = longtailEntries.map((entry) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: createDiagnostic({
      severity: 'info',
      ruleId: 'theme-feature-longtail-detected',
      source: SOURCE,
      message: `theme.features \`${entry.flag}\`: ${entry.recommendation}`,
    }),
  }));

  const insidersEntries = detectInsidersFeatures({
    themeFeatures: input.themeFeatures,
    pluginNames: config.plugins.map((p) => p.name),
  });
  const insidersDiagnostics: ReadonlyArray<TaggedDiagnostic> = insidersEntries.map((entry) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: createDiagnostic({
      severity: 'info',
      ruleId: 'material-insiders-feature-detected',
      source: SOURCE,
      message:
        entry.kind === 'theme-feature'
          ? `theme.features \`${entry.feature}\`: ${entry.rationale}`
          : `plugins \`${entry.feature}\`: ${entry.rationale}`,
    }),
  }));

  const pythonTagDiagnostics: ReadonlyArray<TaggedDiagnostic> = input.strippedPythonTags.map(
    (tag) => ({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info' as const,
        ruleId: 'yaml-python-tag-stripped',
        source: SOURCE,
        message: `Python tag stripped from mkdocs.yml: ${tag}`,
      }),
    }),
  );

  const expressiveCodeDiagnostics = diagnoseExpressiveCode(expressiveCodeConfig);
  const themeLanguageDiagnostics = diagnoseThemeLanguage(themeLanguage);
  const analyticsDiagnostics = diagnoseAnalytics(analytics);
  const themeFontsDiagnostics = diagnoseThemeFonts(themeFonts);
  const deferredDiagnostics = buildDeferredWizardDiagnostics(input.deferredInput);

  const pluginDiagnostics: ReadonlyArray<TaggedDiagnostic> = diagnosePlugins(
    config.plugins,
    config.markdownExtensions,
  ).map((d) => ({ sourcePath: 'mkdocs.yml', diagnostic: d }));

  const bulkOccurrenceDiagnostics = await runBulkScans({
    docsDir: input.docsDir,
    projectDir: input.projectDir,
    fs: input.fs,
    dirReader: input.dirReader,
    sourcePaths: input.sourcePaths,
    plugins: config.plugins,
    markdownExtensions: config.markdownExtensions,
    hasTabsLink: input.hasTabsLink,
    extraCssPaths: extraAssets.css,
    extraJsPaths: extraAssets.js.map((j) => j.src),
  });

  const extraWarningDiagnostics: ReadonlyArray<TaggedDiagnostic> = detectExtraWarnings(
    config.extras,
  ).map((d: Diagnostic) => ({ sourcePath: 'mkdocs.yml', diagnostic: d }));

  const autoDiscoveryDiagnostics: ReadonlyArray<TaggedDiagnostic> =
    input.autoDiscovery === null
      ? []
      : [
          {
            sourcePath: 'mkdocs.yml',
            diagnostic: createDiagnostic({
              severity: 'info',
              ruleId: 'mkdocs-config-auto-discovered',
              source: SOURCE,
              message:
                `No mkdocs.yml at ${input.autoDiscovery.fromDir} — auto-discovered ` +
                `${input.autoDiscovery.discoveredRelPath} and converted from ${input.projectDir}. ` +
                `Pass that path directly on subsequent runs to skip discovery.`,
            }),
          },
        ];

  const allDiagnostics: ReadonlyArray<TaggedDiagnostic> = [
    ...autoDiscoveryDiagnostics,
    ...input.precomputedDiagnostics,
    ...pluginDiagnostics,
    ...includeMarkdownAppliedDiagnostic,
    ...paletteDiagnostics,
    ...pythonTagDiagnostics,
    ...themeFeatureDiagnostics,
    ...extraWarningDiagnostics,
    ...longtailDiagnostics,
    ...insidersDiagnostics,
    ...hookDiagnostics,
    ...expressiveCodeDiagnostics,
    ...themeLanguageDiagnostics,
    ...themeFontsDiagnostics,
    ...analyticsDiagnostics,
    ...deferredDiagnostics,
    ...bulkOccurrenceDiagnostics,
  ];

  return {
    allDiagnostics,
    detected: {
      palette,
      themeFonts,
      redirects,
      expressiveCodeConfig,
      analytics,
      i18n,
      social,
      editLinkBaseUrl,
      tableOfContents,
      extraAssets,
    },
  };
}

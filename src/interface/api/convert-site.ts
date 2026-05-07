/**
 * Top-level programmatic API: convert a MkDocs project on disk into a
 * Starlight-shaped output directory.
 *
 * The single place where every layer wires together. Use-cases stay pure;
 * infrastructure adapters do the I/O; this function is the imperative shell.
 *
 * Inputs: `projectDir` (absolute path containing `mkdocs.yml`), `outputDir`
 * (absolute target).
 *
 * Outputs: `diagnostics` (per-file warnings tagged with source path),
 * `sidebarSource` (JS source for `sidebar` in `astro.config.mjs`).
 *
 * Errors are typed (`config-not-found`, `yaml-decode-failed`,
 * `config-invalid`, `slug-conflict`, `file-write-failed`). Never throws on
 * user input; only on programmer error or OS conditions.
 */

import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parseRepoUrl } from '../../domain/config/repo-context.js';
import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok, type Result } from '../../domain/result.js';
import { mapAnalyticsToHeadEntries } from '../../domain/starlight/analytics-mapping.js';
import { mapMaterialPaletteToStarlight } from '../../domain/starlight/palette-mapping.js';
import { atomicCopyFile, atomicWriteText } from '../../infrastructure/fs/atomic-write.js';
import { createNodeConfigDiscoverer } from '../../infrastructure/fs/node-config-discoverer.js';
import { createNodeDirectoryReader } from '../../infrastructure/fs/node-directory-reader.js';
import { createNodeFileSystem } from '../../infrastructure/fs/node-file-system.js';
import { createMdxOutputValidator } from '../../infrastructure/mdx/at-mdx-js-validator.js';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { convertSite, type TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';
import {
  collectUnknownFrontmatterFieldNames,
  enrichMissingDocsDirMessage,
} from '../../use-cases/convert-site/diagnostic-enrichment.js';
import { buildDeferredWizardDiagnostics } from '../../use-cases/convert-site/wizard-decision-diagnostics.js';
import { type AssetCopy, planAssetCopies } from '../../use-cases/copy-assets/plan.js';
import { extractAutoAppend } from '../../use-cases/detect-features/auto-append.js';
import { diagnosePlugins } from '../../use-cases/detect-features/diagnose-plugins.js';
import { deriveEditLinkBaseUrl } from '../../use-cases/detect-features/edit-link.js';
import {
  applyExcludePatterns,
  extractExcludePatterns,
} from '../../use-cases/detect-features/exclude-config.js';
import { extractExpressiveCodeConfig } from '../../use-cases/detect-features/expressive-code-config.js';
import { extractAlternateLocales } from '../../use-cases/detect-features/extra-alternate.js';
import { extractExtraAssets } from '../../use-cases/detect-features/extra-assets.js';
import { detectExtraWarnings } from '../../use-cases/detect-features/extra-warnings.js';
import { detectFeaturesFromPlugins } from '../../use-cases/detect-features/from-plugins.js';
import { detectFeaturesFromThemeFeatures } from '../../use-cases/detect-features/from-theme-features.js';
import {
  diagnoseHooks,
  extractHookPaths,
} from '../../use-cases/detect-features/diagnose-hooks.js';
import { diagnosePalette } from '../../use-cases/detect-features/diagnose-palette.js';
import { diagnoseThemeFeatures } from '../../use-cases/detect-features/diagnose-theme-features.js';
import { diagnoseExpressiveCode } from '../../use-cases/detect-features/diagnose-expressive-code.js';
import { diagnoseThemeLanguage } from '../../use-cases/detect-features/diagnose-theme-language.js';
import { diagnoseAnalytics } from '../../use-cases/detect-features/diagnose-analytics.js';
import { diagnoseThemeFonts } from '../../use-cases/detect-features/diagnose-theme-fonts.js';
import { resolveThemeAssets } from '../../use-cases/detect-features/resolve-theme-assets.js';
import { extractPluginOptions } from '../../use-cases/detect-features/extract-plugin-options.js';
import { buildSidebar } from '../../use-cases/compile-navigation/build-sidebar.js';
import {
  extractI18nConfig,
  extractI18nLocales,
} from '../../use-cases/detect-features/i18n-config.js';
import { detectInsidersFeatures } from '../../use-cases/detect-features/insiders-features.js';
import { extractRedirects } from '../../use-cases/detect-features/redirects.js';
import { runBulkScans } from '../../use-cases/scan-occurrences/run-bulk-scans.js';
import { applyThemeAssetCopies } from '../../use-cases/copy-assets/apply-theme-asset-copies.js';
import { buildOutputSources } from '../../use-cases/serialize-config/build-output-sources.js';
import { extractSocial } from '../../use-cases/detect-features/social.js';
import { detectLongtailFeatures } from '../../use-cases/detect-features/theme-features-longtail.js';
import { extractThemeFonts } from '../../use-cases/detect-features/theme-fonts.js';
import { extractThemeLanguage } from '../../use-cases/detect-features/theme-language.js';
import { extractTocConfig } from '../../use-cases/detect-features/toc-config.js';
import { loadMkdocsConfig } from '../../use-cases/load-config/load-mkdocs-config.js';
import { serializeAstroConfig } from '../../use-cases/serialize-config/astro-config.js';
import { serializeBiomeConfig } from '../../use-cases/serialize-config/biome-config.js';
import { serializeContentConfig } from '../../use-cases/serialize-config/content-config.js';
import { serializeMigrationNotes } from '../../use-cases/serialize-config/migration-notes.js';
import { serializePackageJson } from '../../use-cases/serialize-config/package-json.js';
import { serializeSidebar } from '../../use-cases/serialize-config/sidebar.js';
import { inferFrontmatterTypes } from '../../use-cases/validate-output/infer-frontmatter-types.js';

export interface ConvertSiteFromDiskInput {
  readonly projectDir: string;
  readonly outputDir: string;
  readonly snippetBasePaths?: ReadonlyArray<string>;
  /** When false, omits starlight-links-validator from generated config. Defaults to true. */
  readonly linksValidator?: boolean;
  /** Override for tab output mode. Defaults to `'mdx'` — emit Starlight
   *  `<Tabs>+<TabItem>` JSX (file promoted to `.mdx`); `syncKey` is added
   *  when `content.tabs.link` is set in `theme.features`. `'html'` is a
   *  legacy opt-out that emits `<div class="sl-tabs">` plus a CSS shim;
   *  retained for users who must keep `.md` extensions and do not need
   *  Starlight's native tab styling. */
  readonly tabs?: 'mdx' | 'html';
  /** When false, suppresses rss.xml.ts output even if the rss plugin is detected. */
  readonly rss?: boolean;
  /** Palette override strategy. 'skip' or 'custom' omits the :root accent block. */
  readonly palette?: 'translate' | 'skip' | 'custom';
  /** Output filename for the Astro config: 'mjs' (default) or 'ts'. */
  readonly configFormat?: 'mjs' | 'ts';
  /** Override for the package.json name field; bypasses slugification. */
  readonly packageName?: string;
  /** When true and a logo is present, emits replacesTitle: true in the logo block. */
  readonly logoReplacesTitle?: boolean;
  /** Explicit version slugs for starlight-versions. Overrides the placeholder when the
   *  versions feature is detected. Empty array emits `versions: []`. */
  readonly mikeVersions?: ReadonlyArray<string>;
  /** When true, allow overwriting a non-empty output directory. */
  readonly force?: boolean;

  // ── Deferred options (v2) ────────────────────────────────────────────────
  // These are accepted so the wizard can pass them through, but the actual
  // behavior change is not yet implemented. When set to a non-default value
  // a `wizard-decision-applied` info diagnostic is emitted.

  /** Card output format override. Deferred — no behavior change yet. */
  readonly cards?: 'mdx' | 'html' | 'skip';
  /** MDX output mode override. Deferred — no behavior change yet. */
  readonly mdxMode?: 'auto' | 'always' | 'never';
  /** Keep explicit heading ID anchors from MkDocs source. Deferred. */
  readonly keepExplicitHeadingIds?: boolean;
  /** Disable smart-symbol substitution (arrows, ellipsis, etc.). Deferred. */
  readonly noSmartSymbols?: boolean;
  /** Disable emoji shortcode expansion. Deferred. */
  readonly noEmojiShortcodes?: boolean;
  /** Disable inline marks (==highlight==, ^^insert^^, etc.). Deferred. */
  readonly noInlineMarks?: boolean;
  /** Disable auto-append snippet injection. Deferred. */
  readonly noAutoAppend?: boolean;
  /** Maximum snippet inclusion depth override. Deferred. */
  readonly snippetMaxDepth?: number;
  /** Dedent subsections in snippet output. Deferred. */
  readonly snippetDedentSubsections?: boolean;
  /** ExpressiveCode theme override (Shiki theme name). Deferred. */
  readonly expressiveCodeTheme?: string;
  /** Path to a custom admonition type-mapping YAML file. Deferred. */
  readonly admonitionMapPath?: string;
  /** Extra asset paths to include in the output. Deferred. */
  readonly extraAssets?: ReadonlyArray<string>;
  /** Locale codes for i18n output. Deferred. */
  readonly locales?: ReadonlyArray<string>;
  /** Rule IDs to suppress in the diagnostic stream. Deferred. */
  readonly suppressRules?: ReadonlyArray<string>;
  /** When false, user opted out of starlight-sidebar-topics auto-install. Deferred. */
  readonly sidebarTopics?: boolean;
  /**
   * Optional injected output validator (test seam). When omitted, the API
   * default-wires the production `@mdx-js/mdx`-backed adapter. Pass `null`
   * to explicitly skip post-conversion syntax validation.
   */
  readonly outputValidator?:
    | import('../../domain/ports/output-validator.js').OutputValidator
    | null;
}

export interface ConvertSiteFromDiskOutput {
  readonly diagnostics: ReadonlyArray<TaggedDiagnostic>;
  readonly sidebarSource: string;
  readonly astroConfigSource: string;
  readonly packageJsonSource: string;
  readonly migrationNotesSource: string;
}

export interface ConvertSiteFromDiskError {
  readonly code:
    | 'config-not-found'
    | 'config-ambiguous'
    | 'yaml-decode-failed'
    | 'config-invalid'
    | 'directory-read-failed'
    | 'slug-conflict'
    | 'file-read-failed'
    | 'file-write-failed'
    | 'nav-compile-failed'
    | 'output-not-empty';
  readonly message: string;
  /**
   * Set when `code === 'config-ambiguous'`: every `mkdocs.yml`/`mkdocs.yaml`
   * that survived the discoverer's prune list, in rank order. The CLI
   * renders these as a numbered list so the user can re-run the converter
   * pointing at the intended subdirectory directly.
   */
  readonly candidates?: ReadonlyArray<string>;
}

const STARLIGHT_CONTENT_PREFIX = ['src', 'content', 'docs'] as const;
const ASSET_EXTENSIONS: ReadonlyArray<string> = [
  '.md',
  '.mdx',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.avif',
  '.pdf',
  '.mp4',
  '.webm',
];

export async function convertSiteFromDisk(
  input: ConvertSiteFromDiskInput,
): Promise<Result<ConvertSiteFromDiskOutput, ConvertSiteFromDiskError>> {
  const fs = createNodeFileSystem();
  const dirReader = createNodeDirectoryReader();
  const yamlDecoder = createJsYamlDecoder();
  const configDiscoverer = createNodeConfigDiscoverer();

  const loaded = await loadMkdocsConfig(
    { inputDir: input.projectDir },
    { fs, dirReader, yamlDecoder, configDiscoverer },
  );
  if (!loaded.ok) {
    return err(translateLoadError(loaded.error, input.projectDir));
  }
  const projectDir = loaded.value.projectDir;
  const autoDiscovery = loaded.value.autoDiscovery;
  const strippedPythonTags = loaded.value.strippedPythonTags;
  const config = { ok: true as const, value: loaded.value.config };

  // Idempotency guard: if output dir exists and is non-empty, demand --force.
  if (input.force !== true) {
    let existing: string[] = [];
    try {
      existing = await readdir(input.outputDir);
    } catch {
      // dir doesn't exist — fine
    }
    if (existing.length > 0) {
      return err({
        code: 'output-not-empty',
        message: `Output directory ${input.outputDir} is not empty. Re-run with --force to overwrite, or pick a different output directory.`,
      });
    }
  }

  const docsDir = join(projectDir, config.value.docsDir);
  const sourceListingRaw = await dirReader.list(docsDir, ['.md', '.mdx']);
  if (!sourceListingRaw.ok) {
    return err({
      code: 'directory-read-failed',
      message: enrichMissingDocsDirMessage(sourceListingRaw.error.message, config.value.plugins),
    });
  }
  // Apply mkdocs-exclude patterns BEFORE every downstream step that walks
  // the file list (sidebar, asset planning, slug map). Filtering here means
  // excluded pages never appear in the output, the sidebar, or the slug
  // map — matching mkdocs-exclude's semantics.
  const excludePatterns = extractExcludePatterns(config.value.plugins);
  const sourceListing = {
    ok: true as const,
    value: applyExcludePatterns(sourceListingRaw.value, excludePatterns),
  };
  const allFiles = await dirReader.list(docsDir, ASSET_EXTENSIONS);
  if (!allFiles.ok) {
    return err({
      code: 'directory-read-failed',
      message: enrichMissingDocsDirMessage(allFiles.error.message, config.value.plugins),
    });
  }
  const themeOptionsForExcludes = config.value.theme?.options ?? {};
  const logoExcludePath =
    typeof themeOptionsForExcludes.logo === 'string' ? themeOptionsForExcludes.logo : null;
  const faviconExcludePath =
    typeof themeOptionsForExcludes.favicon === 'string' ? themeOptionsForExcludes.favicon : null;
  const assetPlanExcludes = [logoExcludePath, faviconExcludePath].filter(
    (p): p is string => p !== null,
  );
  const assetPlan = planAssetCopies({
    allFiles: allFiles.value,
    markdownExtensions: ['.md', '.mdx'],
    excludePaths: assetPlanExcludes,
  });

  const resolvedSnippetBasePaths =
    input.snippetBasePaths === undefined
      ? undefined
      : input.snippetBasePaths.map((p) => join(projectDir, p));
  const repoContext = parseRepoUrl(config.value.repoUrl);

  const autoAppendContent = await readAutoAppendContent(
    extractAutoAppend(config.value.markdownExtensions),
    docsDir,
    fs,
  );

  const i18nLocales = extractI18nLocales(config.value.plugins);
  const includeMarkdownEnabled = config.value.plugins.some((p) => p.name === 'include-markdown');
  const macrosScanEnabled = config.value.plugins.some((p) => p.name === 'macros');
  const themeFeatures = (() => {
    const f = config.value.theme?.options.features;
    return Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : [];
  })();
  const hasTabsLink = themeFeatures.includes('content.tabs.link');
  const hasNavigationTabs = themeFeatures.includes('navigation.tabs');
  // Default to MDX so tabs render via Starlight's native <Tabs>+<TabItem>
  // components (theme-aware styling, accessibility, syncKey support). The
  // legacy `html` mode emits `<div class="sl-tabs">` + a CSS shim and is
  // retained only for callers who explicitly opt in via `tabs: 'html'`.
  const emitMdxTabs = input.tabs !== 'html';

  // Default-wire the production validator. Callers can pass an explicit
  // validator (test seam) or `null` to skip validation entirely.
  const outputValidator =
    input.outputValidator === undefined ? createMdxOutputValidator() : input.outputValidator;

  const siteResult = await convertSite({
    docsDir,
    sourcePaths: sourceListing.value,
    fs,
    repoContext,
    autoAppendContent,
    i18nLocales,
    includeMarkdownEnabled,
    macrosScanEnabled,
    emitMdxTabs,
    tabsLinked: hasTabsLink,
    // When the Material `blog` plugin is configured, propagate `blog_dir`
    // (defaulting to `blog`) so convertSite skips the source's
    // `<blogDir>/index.md` — starlight-blog auto-generates the landing
    // page and emitting the source's index would crash `astro build`.
    ...(() => {
      const bp = config.value.plugins.find((p) => p.name === 'blog');
      if (bp === undefined) return {};
      const dir =
        typeof bp.options['blog_dir'] === 'string' ? (bp.options['blog_dir'] as string) : 'blog';
      return { blogDir: dir };
    })(),
    snippetDedentSubsections:
      snippetExtensionOptions(config.value.markdownExtensions)['dedent_subsections'] === true,
    ...(resolvedSnippetBasePaths === undefined
      ? {}
      : { snippetBasePaths: resolvedSnippetBasePaths }),
    ...(outputValidator === null ? {} : { outputValidator }),
  });
  if (!siteResult.ok) {
    return err({
      code: siteResult.error.code === 'slug-conflict' ? 'slug-conflict' : 'file-read-failed',
      message: siteResult.error.message,
    });
  }

  const sidebarBuilt = await buildSidebar({
    docsDir,
    fs,
    yaml: yamlDecoder,
    plugins: config.value.plugins,
    nav: config.value.nav,
    slugMap: siteResult.value.slugMap,
    sourcePaths: sourceListing.value,
  });
  if (!sidebarBuilt.ok) {
    return err({ code: sidebarBuilt.error.kind, message: sidebarBuilt.error.message });
  }
  const sidebarWithPages = sidebarBuilt.value.sidebar;

  const featuresFromPlugins = detectFeaturesFromPlugins(
    config.value.plugins,
    config.value.markdownExtensions,
  );
  const featuresFromThemeFlags = detectFeaturesFromThemeFeatures(themeFeatures);
  const allFeatures = [
    ...new Set([
      ...siteResult.value.detectedFeatures,
      ...featuresFromPlugins,
      ...featuresFromThemeFlags,
    ]),
  ].sort();

  // Extract per-plugin option dicts so the astro-config + og-endpoint
  // serializers can translate the load-bearing knobs (blog_dir,
  // pagination_per_page, tags_hierarchy, cards_layout_options, …) into
  // their starlight-* / astro-og-canvas equivalents. Unrecognized keys
  // are dropped during translation; the plugin-blog/-tags/-social
  // diagnostics remain the canonical pointers to manual remediation.
  const { blogOptions, tagsOptions, socialCardsLayoutOptions } = await extractPluginOptions({
    plugins: config.value.plugins,
    docsDir,
    fs,
    yaml: yamlDecoder,
  });

  // Plugin-level diagnostics (for plugins that have no Starlight equivalent
  // or are deprecated by Material itself). These are emitted once per run,
  // not per file, and are tagged with `mkdocs.yml` as their source path so
  // the user can find them in MIGRATION_NOTES.md.
  const pluginDiagnostics = diagnosePlugins(
    config.value.plugins,
    config.value.markdownExtensions,
  ).map((d) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: d,
  }));
  const sectionIndexDiagnostics = sidebarBuilt.value.sectionIndexDiagnostics;
  const literateNavDiagnostics = sidebarBuilt.value.literateNavDiagnostics;
  const includeMarkdownAppliedDiagnostic = includeMarkdownEnabled
    ? [
        {
          sourcePath: 'mkdocs.yml',
          diagnostic: createDiagnostic({
            severity: 'info' as const,
            ruleId: 'plugin-include-markdown-applied',
            source: 'mkdocs-material-to-starlight',
            message:
              'mkdocs-include-markdown-plugin: `{% include %}` and `{% include-markdown %}` directives have been resolved inline before per-file conversion.',
          }),
        },
      ]
    : [];

  const palette = mapMaterialPaletteToStarlight(config.value.theme?.options.palette ?? null);
  const paletteRaw = config.value.theme?.options.palette;
  const paletteSpecified = paletteRaw !== undefined && paletteRaw !== null;
  const paletteDiagnostics = diagnosePalette(palette, paletteSpecified);

  const hookDiagnostics = await diagnoseHooks({
    projectDir,
    fs,
    hookPaths: extractHookPaths(config.value.extras),
  });

  const themeFeatureDiagnostics = diagnoseThemeFeatures({
    hasTabsLink,
    hasNavigationTabs,
    themeFeatures,
    copyright: config.value.copyright,
    repoUrl: config.value.repoUrl,
    repoName: config.value.repoName,
    themeOptions: config.value.theme?.options ?? {},
  });

  // Per-flag info diagnostics for long-tail theme.features entries not covered
  // by the primary classifier. Each entry gets its own diagnostic with a rich
  // Starlight-approximation recommendation so users can find each affected flag
  // in MIGRATION_NOTES.md.
  const longtailEntries = detectLongtailFeatures(themeFeatures);
  const longtailDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = longtailEntries.map((entry) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: createDiagnostic({
      severity: 'info',
      ruleId: 'theme-feature-longtail-detected',
      source: 'mkdocs-material-to-starlight',
      message: `theme.features \`${entry.flag}\`: ${entry.recommendation}`,
    }),
  }));

  // Per-flag/plugin info diagnostics for Material Insiders features. These
  // run alongside (not instead of) the longtail/diagnose-plugins detectors —
  // the Insiders rule provides the explicit "this requires a paid Material
  // subscription" labeling so users can grep MIGRATION_NOTES.md for `insiders`.
  const insidersEntries = detectInsidersFeatures({
    themeFeatures,
    pluginNames: config.value.plugins.map((p) => p.name),
  });
  const insidersDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = insidersEntries.map((entry) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: createDiagnostic({
      severity: 'info',
      ruleId: 'material-insiders-feature-detected',
      source: 'mkdocs-material-to-starlight',
      message:
        entry.kind === 'theme-feature'
          ? `theme.features \`${entry.feature}\`: ${entry.rationale}`
          : `plugins \`${entry.feature}\`: ${entry.rationale}`,
    }),
  }));

  const pythonTagDiagnostics = strippedPythonTags.map((tag) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: createDiagnostic({
      severity: 'info' as const,
      ruleId: 'yaml-python-tag-stripped',
      source: 'mkdocs-material-to-starlight',
      message: `Python tag stripped from mkdocs.yml: ${tag}`,
    }),
  }));

  const expressiveCodeConfig = extractExpressiveCodeConfig(config.value.markdownExtensions);
  const expressiveCodeDiagnostics = diagnoseExpressiveCode(expressiveCodeConfig);

  const redirects = extractRedirects(config.value.plugins);
  const i18nFromPlugin = extractI18nConfig(config.value.plugins);
  const i18nFromAlternate =
    i18nFromPlugin === null ? extractAlternateLocales(config.value.extras) : null;
  const themeLanguage =
    i18nFromPlugin === null && i18nFromAlternate === null
      ? extractThemeLanguage(config.value.theme?.options ?? {})
      : undefined;
  const themeLanguageDiagnostics = diagnoseThemeLanguage(themeLanguage);

  const analytics = mapAnalyticsToHeadEntries(config.value.extras);
  const analyticsDiagnostics = diagnoseAnalytics(analytics);

  const themeFonts = extractThemeFonts(config.value.theme?.options ?? {});
  const themeFontsDiagnostics = diagnoseThemeFonts(themeFonts);

  const deferredDiagnostics = buildDeferredWizardDiagnostics(input);

  // Hoisted: needed both by the CSS scanner below and by config serialization.
  const extraAssets = extractExtraAssets(config.value.extras);

  const bulkOccurrenceDiagnostics = await runBulkScans({
    docsDir,
    projectDir,
    fs,
    dirReader,
    sourcePaths: sourceListing.value,
    plugins: config.value.plugins,
    markdownExtensions: config.value.markdownExtensions,
    hasTabsLink,
    extraCssPaths: extraAssets.css,
    extraJsPaths: extraAssets.js.map((j) => j.src),
  });

  // Surface diagnostics for `extra:` keys with no Starlight equivalent
  // (consent dialog, lifecycle status dictionary, non-Google analytics
  // providers). Pure detection — does not affect other branches.
  const extraWarningDiagnostics = detectExtraWarnings(config.value.extras).map((d) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: d,
  }));

  // Surface the auto-discovery redirect (when it fired) in the diagnostic
  // stream so it lands in CI logs and `MIGRATION_NOTES.md` next to every
  // other config-level finding. Call-site honest: the user who ran the
  // converter against `<repo>` sees exactly which subdir we picked.
  const autoDiscoveryDiagnostics =
    autoDiscovery === null
      ? []
      : [
          {
            sourcePath: 'mkdocs.yml',
            diagnostic: createDiagnostic({
              severity: 'info',
              ruleId: 'mkdocs-config-auto-discovered',
              source: 'mkdocs-material-to-starlight',
              message:
                `No mkdocs.yml at ${autoDiscovery.fromDir} — auto-discovered ` +
                `${autoDiscovery.discoveredRelPath} and converted from ${projectDir}. ` +
                `Pass that path directly on subsequent runs to skip discovery.`,
            }),
          },
        ];

  const allDiagnostics = [
    ...autoDiscoveryDiagnostics,
    ...siteResult.value.diagnostics,
    ...pluginDiagnostics,
    ...sectionIndexDiagnostics,
    ...literateNavDiagnostics,
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

  const i18nFromThemeLanguage =
    themeLanguage === undefined
      ? null
      : {
          defaultLocale: themeLanguage.code,
          locales: [
            {
              code: themeLanguage.code,
              label: themeLanguage.label,
              isDefault: true,
            },
          ],
        };
  const i18n = i18nFromPlugin ?? i18nFromAlternate ?? i18nFromThemeLanguage;
  const social = extractSocial(config.value.extras);
  const editLinkBaseUrl = deriveEditLinkBaseUrl(config.value.repoUrl, config.value.editUri);
  const tableOfContents = extractTocConfig(config.value.markdownExtensions);
  // Split extra CSS into two buckets:
  //   - external URLs (e.g. https://fonts.…/foo.css) pass through to
  //     Starlight `customCss` — Vite leaves the URL alone.
  //   - local CSS files (`docs/css/extra.css`) get copied to `public/`
  //     by the asset planner. Starlight's `customCss` cannot resolve
  //     public-folder paths (Rollup tries to bundle them and fails). We
  //     instead emit a `<link rel="stylesheet" href="/<path>">` entry in
  //     `head[]` so the file loads as a static asset at runtime.
  const extraCssExternal: string[] = [];
  const extraCssPublicHrefs: string[] = [];
  for (const p of extraAssets.css) {
    if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(p)) {
      extraCssExternal.push(p);
    } else {
      extraCssPublicHrefs.push(`/${p.replace(/^\/+/, '')}`);
    }
  }
  const extraCssEntries = extraCssExternal;
  // Fontsource packages are imported as bare specifiers — Vite resolves
  // them as the package's CSS export, so they slot into customCss verbatim.
  const fontCssImports: string[] = [];
  if (themeFonts?.text !== undefined) fontCssImports.push(themeFonts.text.package);
  if (themeFonts?.code !== undefined) fontCssImports.push(themeFonts.code.package);
  const fontDependencies: ReadonlyArray<readonly [string, string]> = fontCssImports.map(
    (p) => [p, 'latest'] as const,
  );
  const extraJsEntries = extraAssets.js.map((js) => ({
    ...js,
    src: /^[a-z][a-z0-9+\-.]*:\/\//i.test(js.src) ? js.src : `/${js.src.replace(/^\/+/, '')}`,
  }));
  const { logoSrc, faviconRaw, faviconRawCandidate, faviconExtensionRejected } =
    await resolveThemeAssets({
      themeOptions: config.value.theme?.options ?? {},
      fs,
      docsDir,
    });
  // starlight-links-validator: opt-in (default OFF) since 2026-05-05.
  //
  // Real-world Material sites routinely link to non-content paths (`/LICENSE`,
  // `/CHANGELOG`, `/contributing`, etc. that point at GitLab/GitHub web
  // surfaces, gh-pages aliases, or static files) AND to dynamic pages that
  // MkDocs generated (mkdocs-click CLI references, mkdocstrings autodoc).
  // The plugin's defaults reject all of these at `astro build`, breaking
  // every migrated build out-of-the-box.
  //
  // The converter's own `broken-link` diagnostic catches the genuinely
  // missing cross-content links during conversion (and surfaces them in
  // MIGRATION_NOTES.md). That covers the validator's primary value
  // proposition for migration users without the noise.
  //
  // Users who want strict pre-deploy validation can opt in via the
  // `linksValidator: true` API flag (or the `--strict-links` CLI flag).
  const enableLinksValidator = input.linksValidator === true;
  const logoEntry =
    logoSrc === null
      ? {}
      : {
          logo: {
            src: `./src/assets/${posix.basename(logoSrc)}`,
            ...(input.logoReplacesTitle === true ? { replacesTitle: true as const } : {}),
          },
        };
  const astroConfigSource = serializeAstroConfig({
    siteName: config.value.siteName,
    siteDescription: config.value.siteDescription,
    siteUrl: config.value.siteUrl,
    useDirectoryUrls: config.value.useDirectoryUrls,
    sidebar: sidebarWithPages,
    detectedFeatures: allFeatures,
    redirects,
    enableLinksValidator,
    extraCssEntries: [...extraCssEntries, ...fontCssImports],
    extraJsEntries,
    ...(i18n === null ? {} : { i18n }),
    ...(social.length > 0 ? { social } : {}),
    ...(editLinkBaseUrl === null ? {} : { editLinkBaseUrl }),
    ...(tableOfContents === undefined ? {} : { tableOfContents }),
    ...logoEntry,
    ...(faviconRaw === null ? {} : { favicon: `/${posix.basename(faviconRaw)}` }),
    ...(expressiveCodeConfig === undefined
      ? {}
      : { expressiveCode: { themes: expressiveCodeConfig.themes } }),
    ...(analytics !== null || extraCssPublicHrefs.length > 0
      ? {
          extraHeadEntries: [
            ...(analytics?.headEntries ?? []),
            ...extraCssPublicHrefs.map((href) => ({
              tag: 'link' as const,
              attrs: { rel: 'stylesheet', href },
            })),
          ],
        }
      : {}),
    ...(input.mikeVersions !== undefined ? { mikeVersions: input.mikeVersions } : {}),
    ...(blogOptions !== undefined ? { blogOptions } : {}),
    ...(tagsOptions !== undefined ? { tagsOptions } : {}),
  });
  const packageJsonSource = serializePackageJson({
    siteName: config.value.siteName,
    siteDescription: config.value.siteDescription,
    detectedFeatures: allFeatures,
    extraDependencies: fontDependencies,
    ...(input.packageName !== undefined ? { packageName: input.packageName } : {}),
  });
  const sourceDocs = Object.values(siteResult.value.files).map((source) => ({
    source,
  }));
  const migrationNotesSource = serializeMigrationNotes({
    diagnostics: allDiagnostics,
    extras: config.value.extras,
    sourceDocs,
  });

  // Auto-extend the generated `src/content.config.ts` schema with every
  // frontmatter field that triggered an `unknown-frontmatter-field`
  // diagnostic. Without this, every project that uses fields like `tags` or
  // `date` would fail `astro build` until the user manually edits the file.
  // Field types are inferred from observed values; users can tighten later.
  const extendedFrontmatterFields = inferFrontmatterTypes(
    collectUnknownFrontmatterFieldNames(allDiagnostics),
    sourceDocs,
  );

  const { stylesheetSource, rssEndpointSource, ogEndpointSource, tagsYmlSource, preserveSlugs } =
    buildOutputSources({
      siteName: config.value.siteName,
      siteDescription: config.value.siteDescription,
      siteUrl: config.value.siteUrl,
      palette,
      paletteStrategy: input.palette,
      themeFonts,
      detectedFeatures: allFeatures,
      socialCardsLayoutOptions,
      rssOption: input.rss,
      siteDiagnostics: siteResult.value.diagnostics,
    });
  const writeResult = await writeOutputs({
    outputDir: input.outputDir,
    files: siteResult.value.files,
    astroConfigSource,
    packageJsonSource,
    migrationNotesSource,
    stylesheetSource,
    rssEndpointSource,
    ogEndpointSource,
    tagsYmlSource,
    configFormat: input.configFormat ?? 'mjs',
    extendedFrontmatterFields,
    preserveSlugs,
  });
  if (!writeResult.ok) {
    return err({ code: 'file-write-failed', message: writeResult.error });
  }
  const assetCopyResult = await copyAssetsToPublic(docsDir, input.outputDir, assetPlan);
  if (!assetCopyResult.ok) {
    return err({ code: 'file-write-failed', message: assetCopyResult.error });
  }

  await applyThemeAssetCopies({
    docsDir,
    outputDir: input.outputDir,
    logoSrc,
    faviconRaw,
    faviconRawCandidate,
    faviconExtensionRejected,
    migrationNotesSource,
  });

  return ok({
    // Include site-conversion + auto-discovery + plugin-level diagnostics
    // so callers see every signal — auto-discovery in particular surfaces
    // a redirect message when we found mkdocs.yml in a nested folder.
    diagnostics: [...autoDiscoveryDiagnostics, ...siteResult.value.diagnostics],
    sidebarSource: serializeSidebar(sidebarWithPages),
    astroConfigSource,
    packageJsonSource,
    migrationNotesSource,
  });
}

function dirOfRel(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx === -1 ? '' : relPath.slice(0, idx);
}

function translateLoadError(
  error: import('../../use-cases/load-config/load-mkdocs-config.js').LoadMkdocsConfigError,
  inputDir: string,
): ConvertSiteFromDiskError {
  switch (error.kind) {
    case 'config-ambiguous': {
      const list = error.candidates.map((c, i) => `  ${String(i + 1)}. ${c}`).join('\n');
      return {
        code: 'config-ambiguous',
        message:
          `Multiple mkdocs.yml/.yaml found under ${error.searchedDir}. ` +
          `Re-run pointing at the intended subdirectory directly:\n${list}\n` +
          `Example: \`mkdocs-material-to-starlight ${error.searchedDir}/${dirOfRel(error.candidates[0] ?? '')} <output-dir>\``,
        candidates: error.candidates,
      };
    }
    case 'config-not-found':
      return {
        code: 'config-not-found',
        message: `mkdocs.yml not found under ${inputDir} (searched the project tree to depth 4, pruning node_modules/dist/build/.git/site/...).`,
      };
    case 'yaml-decode-failed':
      return { code: 'yaml-decode-failed', message: error.message };
    case 'config-invalid':
      return { code: 'config-invalid', message: error.message };
  }
}

function snippetExtensionOptions(
  exts: ReadonlyArray<{
    readonly name: string;
    readonly options: Readonly<Record<string, unknown>>;
  }>,
): Readonly<Record<string, unknown>> {
  const entry = exts.find((e) => e.name === 'pymdownx.snippets');
  return entry?.options ?? {};
}

async function copyAssetsToPublic(
  docsDir: string,
  outputDir: string,
  plan: ReadonlyArray<AssetCopy>,
): Promise<Result<true, string>> {
  for (const entry of plan) {
    const source = join(docsDir, entry.sourceRelative);
    const target = join(outputDir, 'public', entry.destRelative);
    const copied = await atomicCopyFile(source, target);
    if (!copied.ok) {
      return copied;
    }
  }
  return ok(true);
}

interface WriteOutputsInput {
  readonly outputDir: string;
  readonly files: Readonly<Record<string, string>>;
  readonly astroConfigSource: string;
  readonly packageJsonSource: string;
  readonly migrationNotesSource: string;
  readonly stylesheetSource: string;
  readonly rssEndpointSource: string | null;
  readonly ogEndpointSource: string | null;
  readonly tagsYmlSource: string | null;
  readonly configFormat: 'mjs' | 'ts';
  readonly extendedFrontmatterFields: Readonly<Record<string, string>>;
  /**
   * When true, emit `docsLoader({ generateId })` so source paths with
   * github-slugger-incompatible segments (`1.0/`, `c++-primer.md`) survive
   * verbatim. Set by the caller when any `slug-incompatible-path` diagnostic
   * fired during site conversion.
   */
  readonly preserveSlugs: boolean;
}

async function writeOutputs(input: WriteOutputsInput): Promise<Result<true, string>> {
  for (const [relativePath, content] of Object.entries(input.files)) {
    const target = join(input.outputDir, ...STARLIGHT_CONTENT_PREFIX, relativePath);
    const writeRes = await writeOne(target, content);
    if (!writeRes.ok) {
      return writeRes;
    }
  }
  const astroConfigFilename = `astro.config.${input.configFormat}`;
  const scaffold: Array<readonly [ReadonlyArray<string>, string]> = [
    [[astroConfigFilename], input.astroConfigSource],
    [['package.json'], input.packageJsonSource],
    [['biome.json'], serializeBiomeConfig()],
    [['MIGRATION_NOTES.md'], input.migrationNotesSource],
    [
      ['src', 'content.config.ts'],
      serializeContentConfig(input.extendedFrontmatterFields, {
        preserveSlugs: input.preserveSlugs,
      }),
    ],
    [['src', 'styles', 'mkdocs-migration.css'], input.stylesheetSource],
  ];
  if (input.rssEndpointSource !== null) {
    scaffold.push([['src', 'pages', 'rss.xml.ts'], input.rssEndpointSource]);
  }
  if (input.ogEndpointSource !== null) {
    scaffold.push([['src', 'pages', 'og', '[...slug].png.ts'], input.ogEndpointSource]);
  }
  if (input.tagsYmlSource !== null) {
    scaffold.push([['tags.yml'], input.tagsYmlSource]);
  }
  for (const [parts, content] of scaffold) {
    const writeRes = await writeOne(join(input.outputDir, ...parts), content);
    if (!writeRes.ok) {
      return writeRes;
    }
  }
  return ok(true);
}

async function writeOne(target: string, content: string): Promise<Result<true, string>> {
  // Atomic: write to a sibling tmp, then rename. Prevents partial-output
  // corruption if the process is interrupted mid-write (Ctrl-C, EIO, EBUSY,
  // OOM during astro check). The file is either the previous content or
  // the full new content, never half-written.
  return atomicWriteText(target, content);
}

async function readAutoAppendContent(
  paths: ReadonlyArray<string>,
  docsDir: string,
  fs: FileSystem,
): Promise<string> {
  if (paths.length === 0) {
    return '';
  }
  const bodies: string[] = [];
  for (const relativePath of paths) {
    // Material's `pymdownx.snippets.auto_append` paths are resolved against
    // the configured `base_path` first, falling back to the docs dir. Phase-1
    // tries the docs dir; if not present, the file is silently skipped (the
    // user's diagnostic surface is the conversion run, not this read).
    const candidate = join(docsDir, relativePath);
    const read = await fs.readText(candidate);
    if (read.ok) {
      bodies.push(read.value);
    }
  }
  return bodies.join('\n\n');
}

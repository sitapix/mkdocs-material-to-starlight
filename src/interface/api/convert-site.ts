/**
 * Top-level programmatic API: convert a MkDocs project on disk into a
 * Starlight-shaped output directory.
 *
 * This is the single place where every layer of the converter is wired
 * together. Use-cases stay pure; infrastructure adapters provide the I/O;
 * this function is the imperative shell that hands them to one another.
 *
 * Inputs:
 *   projectDir  — absolute path to the MkDocs project (containing mkdocs.yml)
 *   outputDir   — absolute path where the Astro/Starlight project will be written
 *
 * Outputs:
 *   diagnostics    — every per-file warning aggregated and tagged with source path
 *   sidebarSource  — JS source for the `sidebar` field in `astro.config.mjs`
 *
 * Errors are typed (config-not-found, yaml-decode-failed, config-invalid,
 * slug-conflict, file-write-failed). The function never throws on user
 * input; only on programmer error or OS conditions outside the contract.
 */

import { copyFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ok, err, type Result } from '../../domain/result.js';
import { planAssetCopies, type AssetCopy } from '../../use-cases/copy-assets/plan.js';
import { createNodeFileSystem } from '../../infrastructure/fs/node-file-system.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { createNodeDirectoryReader } from '../../infrastructure/fs/node-directory-reader.js';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { parseMkdocsConfig } from '../../use-cases/config/parse-mkdocs.js';
import { preprocessMkdocsEnvTags } from '../../use-cases/config/preprocess-mkdocs-env-tags.js';
import { preprocessMkdocsPythonTags } from '../../use-cases/config/preprocess-mkdocs-python-tags.js';
import { resolveInherits } from '../../use-cases/config/inherit-config.js';
import { parseNavTree } from '../../use-cases/config/nav-tree.js';
import { compileNavigation } from '../../use-cases/compile-navigation/compile.js';
import { applyPagesOverrides } from '../../use-cases/compile-navigation/apply-pages.js';
import { applySectionIndex } from '../../use-cases/compile-navigation/section-index.js';
import { parseLiterateNav } from '../../use-cases/config/parse-literate-nav.js';
import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import { loadAwesomePagesFiles } from '../../use-cases/config/load-awesome-pages.js';
import { convertSite, type TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';
import { detectFeaturesFromPlugins } from '../../use-cases/detect-features/from-plugins.js';
import { diagnosePlugins } from '../../use-cases/detect-features/diagnose-plugins.js';
import { extractRedirects } from '../../use-cases/detect-features/redirects.js';
import { extractAutoAppend } from '../../use-cases/detect-features/auto-append.js';
import { extractSocial } from '../../use-cases/detect-features/social.js';
import { extractAlternateLocales } from '../../use-cases/detect-features/extra-alternate.js';
import { extractExtraAssets } from '../../use-cases/detect-features/extra-assets.js';
import { classifyHook } from '../../use-cases/detect-features/hook-archetypes.js';
import { deriveEditLinkBaseUrl } from '../../use-cases/detect-features/edit-link.js';
import { extractTocConfig } from '../../use-cases/detect-features/toc-config.js';
import { extractExpressiveCodeConfig } from '../../use-cases/detect-features/expressive-code-config.js';
import { extractThemeLanguage } from '../../use-cases/detect-features/theme-language.js';
import { extractThemeFonts } from '../../use-cases/detect-features/theme-fonts.js';
import { mapAnalyticsToHeadEntries } from '../../domain/starlight/analytics-mapping.js';
import {
  extractI18nLocales,
  extractI18nConfig,
} from '../../use-cases/detect-features/i18n-config.js';
import { parseRepoUrl } from '../../domain/config/repo-context.js';
import { serializeSidebar } from '../../use-cases/serialize-config/sidebar.js';
import { serializeAstroConfig } from '../../use-cases/serialize-config/astro-config.js';
import { serializeContentConfig } from '../../use-cases/serialize-config/content-config.js';
import { serializePackageJson } from '../../use-cases/serialize-config/package-json.js';
import { serializeMigrationNotes } from '../../use-cases/serialize-config/migration-notes.js';
import { serializeRssEndpoint } from '../../use-cases/serialize-config/rss-endpoint.js';
import { serializeStyleSheet } from '../../use-cases/serialize-config/styles.js';
import { mapMaterialPaletteToStarlight } from '../../domain/starlight/palette-mapping.js';
import { classifyThemeFeature } from '../../domain/starlight/theme-feature-catalog.js';
import { detectLongtailFeatures } from '../../use-cases/detect-features/theme-features-longtail.js';
import {
  scanTabsLinkOccurrences,
  scanCodehiliteLinenumsOccurrences,
  scanMetaYmlFiles,
} from '../../use-cases/detect-features/scan-bulk-diagnostics.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';

export interface ConvertSiteFromDiskInput {
  readonly projectDir: string;
  readonly outputDir: string;
  readonly snippetBasePaths?: ReadonlyArray<string>;
  /** When false, omits starlight-links-validator from generated config. Defaults to true. */
  readonly linksValidator?: boolean;
  /** Override for tab output mode. 'mdx' forces Starlight <Tabs>, 'html' forces HTML divs,
   *  undefined falls back to auto-detection from content.tabs.link. */
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
    | 'yaml-decode-failed'
    | 'config-invalid'
    | 'directory-read-failed'
    | 'slug-conflict'
    | 'file-read-failed'
    | 'file-write-failed'
    | 'nav-compile-failed'
    | 'output-not-empty';
  readonly message: string;
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

  const configPath = join(input.projectDir, 'mkdocs.yml');
  const configRead = await fs.readText(configPath);
  if (!configRead.ok) {
    return err({
      code: 'config-not-found',
      message: `mkdocs.yml not found at ${configPath}`,
    });
  }

  const inherited = await resolveInherits(configRead.value, configPath, fs);
  const pythonStripped = preprocessMkdocsPythonTags(
    preprocessMkdocsEnvTags(inherited.source),
  );
  const decoded = yamlDecoder.decode(pythonStripped.source);
  if (!decoded.ok) {
    return err({ code: 'yaml-decode-failed', message: decoded.error.message });
  }

  const config = parseMkdocsConfig(decoded.value);
  if (!config.ok) {
    return err({ code: 'config-invalid', message: config.error.message });
  }

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

  const docsDir = join(input.projectDir, config.value.docsDir);
  const sourceListing = await dirReader.list(docsDir, ['.md', '.mdx']);
  if (!sourceListing.ok) {
    return err({
      code: 'directory-read-failed',
      message: sourceListing.error.message,
    });
  }
  const allFiles = await dirReader.list(docsDir, ASSET_EXTENSIONS);
  if (!allFiles.ok) {
    return err({
      code: 'directory-read-failed',
      message: allFiles.error.message,
    });
  }
  const themeOptionsForExcludes = config.value.theme?.options ?? {};
  const logoExcludePath =
    typeof themeOptionsForExcludes.logo === 'string'
      ? themeOptionsForExcludes.logo
      : null;
  const faviconExcludePath =
    typeof themeOptionsForExcludes.favicon === 'string'
      ? themeOptionsForExcludes.favicon
      : null;
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
      : input.snippetBasePaths.map((p) => join(input.projectDir, p));
  const repoContext = parseRepoUrl(config.value.repoUrl);

  const autoAppendContent = await readAutoAppendContent(
    extractAutoAppend(config.value.markdownExtensions),
    docsDir,
    fs,
  );

  const i18nLocales = extractI18nLocales(config.value.plugins);
  const includeMarkdownEnabled = config.value.plugins.some(
    (p) => p.name === 'include-markdown',
  );
  const macrosScanEnabled = config.value.plugins.some(
    (p) => p.name === 'macros',
  );
  const themeFeatures = (() => {
    const f = config.value.theme?.options.features;
    return Array.isArray(f)
      ? f.filter((x): x is string => typeof x === 'string')
      : [];
  })();
  const hasTabsLink = themeFeatures.includes('content.tabs.link');
  const hasNavigationTabs = themeFeatures.includes('navigation.tabs');
  const emitMdxTabs =
    input.tabs === 'mdx' ? true :
    input.tabs === 'html' ? false :
    hasTabsLink;

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
    snippetDedentSubsections: snippetExtensionOptions(
      config.value.markdownExtensions,
    )['dedent_subsections'] === true,
    ...(resolvedSnippetBasePaths === undefined
      ? {}
      : { snippetBasePaths: resolvedSnippetBasePaths }),
  });
  if (!siteResult.ok) {
    return err({
      code: siteResult.error.code === 'slug-conflict' ? 'slug-conflict' : 'file-read-failed',
      message: siteResult.error.message,
    });
  }

  const candidateDirectories = collectCandidateDirectories(sourceListing.value);
  const pagesResult = await loadAwesomePagesFiles({
    docsDir,
    candidateDirectories,
    fs,
    yaml: yamlDecoder,
  });
  if (!pagesResult.ok) {
    return err({
      code: 'config-invalid',
      message: `.pages parse failed in "${pagesResult.error.directory}": ${pagesResult.error.message}`,
    });
  }

  const sectionIndexEnabled = config.value.plugins.some(
    (p) => p.name === 'section-index',
  );
  const literateNav = await resolveLiterateNav(config.value.plugins, docsDir, fs);
  const sidebarResult = await compileSidebarEntries(
    literateNav.tree === null ? config.value.nav : null,
    literateNav.tree,
    siteResult.value.slugMap,
    sectionIndexEnabled,
  );
  if (!sidebarResult.ok) {
    return err({ code: 'nav-compile-failed', message: sidebarResult.error });
  }

  const sidebarWithPages = applyPagesOverrides(sidebarResult.value.entries, pagesResult.value);

  const featuresFromPlugins = detectFeaturesFromPlugins(config.value.plugins);
  const allFeatures = [
    ...new Set([...siteResult.value.detectedFeatures, ...featuresFromPlugins]),
  ].sort();

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
  const sectionIndexDiagnostics = sidebarResult.value.diagnostics.map((d) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: d,
  }));
  const literateNavDiagnostics = literateNav.diagnostics.map((d) => ({
    sourcePath: literateNav.tree === null ? 'mkdocs.yml' : 'SUMMARY.md',
    diagnostic: d,
  }));
  const includeMarkdownAppliedDiagnostic = includeMarkdownEnabled
    ? [
        {
          sourcePath: 'mkdocs.yml',
          diagnostic: createDiagnostic({
            severity: 'info' as const,
            ruleId: 'plugin-include-markdown-applied',
            source: 'mkdocs-to-starlight',
            message:
              'mkdocs-include-markdown-plugin: `{% include %}` and `{% include-markdown %}` directives have been resolved inline before per-file conversion.',
          }),
        },
      ]
    : [];

  const palette = mapMaterialPaletteToStarlight(
    config.value.theme?.options.palette ?? null,
  );
  const paletteRaw = config.value.theme?.options.palette;
  const paletteSpecified = paletteRaw !== undefined && paletteRaw !== null;
  const paletteDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = [];
  if (palette !== null && !palette.isCustom) {
    paletteDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'palette-translated',
        source: 'mkdocs-to-starlight',
        message: `Material palette primary "${palette.sourceName}" translated to Starlight accent CSS variables (hue=${String(palette.accentHue)}).`,
      }),
    });
  } else if (palette !== null && palette.isCustom) {
    paletteDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'palette-custom-needs-manual',
        source: 'mkdocs-to-starlight',
        message:
          'theme.palette.primary: custom — translate your --md-primary-fg-color overrides to --sl-color-accent-* manually.',
      }),
    });
  } else if (paletteSpecified) {
    paletteDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'palette-unknown-color',
        source: 'mkdocs-to-starlight',
        message:
          'theme.palette.primary names a color the converter does not recognize; using Starlight default accent.',
      }),
    });
  }

  const hookPaths: ReadonlyArray<string> = (() => {
    const raw = config.value.extras.hooks;
    if (!Array.isArray(raw)) return [];
    return raw.filter((p): p is string => typeof p === 'string');
  })();
  const hookDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = [];
  for (const hookRel of hookPaths) {
    const hookFull = join(input.projectDir, hookRel);
    const read = await fs.readText(hookFull);
    if (!read.ok) {
      hookDiagnostics.push({
        sourcePath: hookRel,
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'hook-file-not-found',
          source: 'mkdocs-to-starlight',
          message: `mkdocs.yml hooks: references "${hookRel}" but the file could not be read at ${hookFull}.`,
        }),
      });
      continue;
    }
    const archetypes = classifyHook(read.value);
    hookDiagnostics.push({
      sourcePath: hookRel,
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'hook-archetype-detected',
        source: 'mkdocs-to-starlight',
        message: `Python hook archetypes: ${archetypes.join(', ')}. The converter cannot evaluate Python; reproduce the behaviour as remark/rehype plugin, Starlight component override, or Astro endpoint.`,
      }),
    });
  }

  const themeFeatureDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = [];
  if (hasTabsLink) {
    themeFeatureDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'feature-tabs-link-detected',
        source: 'mkdocs-to-starlight',
        message:
          'theme.features `content.tabs.link` detected. Generated tab blocks are plain HTML; for true cross-page sync, replace with Starlight `<Tabs syncKey="…">` MDX components.',
      }),
    });
  }
  if (hasNavigationTabs) {
    themeFeatureDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'feature-navigation-tabs-recommend-topics',
        source: 'mkdocs-to-starlight',
        message:
          'theme.features `navigation.tabs` detected. Install `starlight-sidebar-topics` and split the generated sidebar into one topic per top-level group for the equivalent UX.',
      }),
    });
  }
  for (const feature of themeFeatures) {
    const classification = classifyThemeFeature(feature);
    if (classification === null) {
      themeFeatureDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'theme-feature-unknown',
          source: 'mkdocs-to-starlight',
          message: `theme.features \`${feature}\` was not recognized as a Material feature flag — typo or post-catalog addition.`,
        }),
      });
      continue;
    }
    if (classification.kind === 'handled-elsewhere') continue;
    themeFeatureDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: classification.kind === 'unsupported' ? 'warning' : 'info',
        ruleId:
          classification.kind === 'unsupported'
            ? 'theme-feature-unsupported'
            : 'theme-feature-replaced',
        source: 'mkdocs-to-starlight',
        message: `theme.features \`${feature}\`: ${classification.note}`,
      }),
    });
  }

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
      source: 'mkdocs-to-starlight',
      message: `theme.features \`${entry.flag}\`: ${entry.recommendation}`,
    }),
  }));

  const pythonTagDiagnostics = pythonStripped.stripped.map((tag) => ({
    sourcePath: 'mkdocs.yml',
    diagnostic: createDiagnostic({
      severity: 'info' as const,
      ruleId: 'yaml-python-tag-stripped',
      source: 'mkdocs-to-starlight',
      message: `Python tag stripped from mkdocs.yml: ${tag}`,
    }),
  }));

  const expressiveCodeConfig = extractExpressiveCodeConfig(
    config.value.markdownExtensions,
  );
  const expressiveCodeDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = [];
  if (expressiveCodeConfig !== undefined) {
    const [light, dark] = expressiveCodeConfig.themes;
    if (expressiveCodeConfig.fellBack) {
      expressiveCodeDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'expressive-code-theme-fallback',
          source: 'mkdocs-to-starlight',
          message: `pygments_style "${expressiveCodeConfig.sourceStyle}" has no curated Shiki equivalent — defaulted to ['${light}', '${dark}']. Replace expressiveCode.themes in astro.config.mjs with a closer match from https://shiki.style/themes.`,
        }),
      });
    } else {
      expressiveCodeDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'expressive-code-theme-applied',
          source: 'mkdocs-to-starlight',
          message: `pygments_style "${expressiveCodeConfig.sourceStyle}" mapped to expressiveCode.themes ['${light}', '${dark}'].`,
        }),
      });
    }
    if (expressiveCodeConfig.unsupportedOptions.length > 0) {
      expressiveCodeDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'expressive-code-options-dropped',
          source: 'mkdocs-to-starlight',
          message: `pymdownx.highlight option(s) dropped (no ExpressiveCode equivalent): ${expressiveCodeConfig.unsupportedOptions.join(', ')}.`,
        }),
      });
    }
  }

  const redirects = extractRedirects(config.value.plugins);
  const i18nFromPlugin = extractI18nConfig(config.value.plugins);
  const i18nFromAlternate = i18nFromPlugin === null
    ? extractAlternateLocales(config.value.extras)
    : null;
  const themeLanguage =
    i18nFromPlugin === null && i18nFromAlternate === null
      ? extractThemeLanguage(config.value.theme?.options ?? {})
      : undefined;
  const themeLanguageDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = [];
  if (themeLanguage !== undefined) {
    themeLanguageDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'theme-language-applied',
        source: 'mkdocs-to-starlight',
        message: `theme.language "${themeLanguage.code}" mapped to starlight locales.root.lang ("${themeLanguage.label}").`,
      }),
    });
  }

  const analytics = mapAnalyticsToHeadEntries(config.value.extras);
  const analyticsDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = [];
  if (analytics !== null) {
    analyticsDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'extra-analytics-applied',
        source: 'mkdocs-to-starlight',
        message: `extra.analytics provider "${analytics.provider}" property "${analytics.property}" injected into starlight head[].`,
      }),
    });
    if (analytics.unsupported.includes('feedback')) {
      analyticsDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'extra-analytics-feedback-dropped',
          source: 'mkdocs-to-starlight',
          message:
            'extra.analytics.feedback widget has no Starlight equivalent — reimplement via a custom component or install a community plugin.',
        }),
      });
    }
  }

  const themeFonts = extractThemeFonts(config.value.theme?.options ?? {});
  const themeFontsDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = [];
  if (themeFonts !== undefined) {
    const parts: string[] = [];
    if (themeFonts.text) parts.push(`text=${themeFonts.text.package}`);
    if (themeFonts.code) parts.push(`code=${themeFonts.code.package}`);
    themeFontsDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'theme-fonts-applied',
        source: 'mkdocs-to-starlight',
        message: `theme.font mapped to Fontsource: ${parts.join(', ')}. Run \`npm install\` to fetch.`,
      }),
    });
  }

  const deferredDiagnostics = buildDeferredDiagnostics(input);

  // Per-occurrence scans for the three previously bulk-emitted diagnostics.
  // Reads source files to find per-file occurrences of the affected patterns.
  const bulkOccurrenceDiagnostics: Array<{ sourcePath: string; diagnostic: ReturnType<typeof createDiagnostic> }> = [];
  const hasCodehilite = config.value.markdownExtensions.some(
    (ext) => (typeof ext === 'string' ? ext : Object.keys(ext)[0] ?? '') === 'codehilite',
  );
  const hasMetaPlugin = config.value.plugins.some((p) => p.name === 'meta');
  if (hasTabsLink || hasCodehilite || hasMetaPlugin) {
    // Read all source files once for the scans.
    const sourceEntries: Array<readonly [string, string]> = [];
    const metaEntries: Array<readonly [string, string]> = [];
    for (const relPath of sourceListing.value) {
      const absPath = join(docsDir, relPath);
      const readResult = await fs.readText(absPath);
      if (!readResult.ok) continue;
      sourceEntries.push([relPath, readResult.value]);
    }
    // Scan for .meta.yml files separately (they're not in sourceListing which only lists .md/.mdx)
    if (hasMetaPlugin) {
      const allDocFiles = await dirReader.list(docsDir, ['.yml', '.yaml']);
      if (allDocFiles.ok) {
        for (const relPath of allDocFiles.value) {
          if (!relPath.endsWith('.meta.yml')) continue;
          const absPath = join(docsDir, relPath);
          const readResult = await fs.readText(absPath);
          if (!readResult.ok) continue;
          metaEntries.push([relPath, readResult.value]);
        }
      }
    }
    if (hasTabsLink) {
      for (const d of scanTabsLinkOccurrences(sourceEntries)) {
        bulkOccurrenceDiagnostics.push(d);
      }
    }
    if (hasCodehilite) {
      for (const d of scanCodehiliteLinenumsOccurrences(sourceEntries)) {
        bulkOccurrenceDiagnostics.push(d);
      }
    }
    if (hasMetaPlugin && metaEntries.length > 0) {
      for (const d of scanMetaYmlFiles(metaEntries)) {
        bulkOccurrenceDiagnostics.push(d);
      }
    }
  }

  const allDiagnostics = [
    ...siteResult.value.diagnostics,
    ...pluginDiagnostics,
    ...sectionIndexDiagnostics,
    ...literateNavDiagnostics,
    ...includeMarkdownAppliedDiagnostic,
    ...paletteDiagnostics,
    ...pythonTagDiagnostics,
    ...themeFeatureDiagnostics,
    ...longtailDiagnostics,
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
  const editLinkBaseUrl = deriveEditLinkBaseUrl(
    config.value.repoUrl,
    config.value.editUri,
  );
  const tableOfContents = extractTocConfig(config.value.markdownExtensions);
  const extraAssets = extractExtraAssets(config.value.extras);
  // Make extra CSS entries Starlight-resolvable: external URLs pass through;
  // local paths are relocated to public/ by the asset planner so we point
  // Starlight at them via /<path> served from the public directory.
  const extraCssEntries = extraAssets.css.map((p) =>
    /^[a-z][a-z0-9+\-.]*:\/\//i.test(p) ? p : `/${p.replace(/^\/+/, '')}`,
  );
  // Fontsource packages are imported as bare specifiers — Vite resolves
  // them as the package's CSS export, so they slot into customCss verbatim.
  const fontCssImports: string[] = [];
  if (themeFonts?.text !== undefined) fontCssImports.push(themeFonts.text.package);
  if (themeFonts?.code !== undefined) fontCssImports.push(themeFonts.code.package);
  const fontDependencies: ReadonlyArray<readonly [string, string]> =
    fontCssImports.map((p) => [p, 'latest'] as const);
  const extraJsEntries = extraAssets.js.map((js) => ({
    ...js,
    src: /^[a-z][a-z0-9+\-.]*:\/\//i.test(js.src)
      ? js.src
      : `/${js.src.replace(/^\/+/, '')}`,
  }));
  const themeOptions = config.value.theme?.options ?? {};
  const logoSrc = typeof themeOptions.logo === 'string' ? themeOptions.logo : null;
  const faviconRaw = typeof themeOptions.favicon === 'string' ? themeOptions.favicon : null;
  const enableLinksValidator = input.linksValidator !== false;
  const logoEntry =
    logoSrc === null
      ? {}
      : {
          logo: {
            src: `./src/assets/${basenameOf(logoSrc)}`,
            ...(input.logoReplacesTitle === true ? { replacesTitle: true as const } : {}),
          },
        };
  const astroConfigSource = serializeAstroConfig({
    siteName: config.value.siteName,
    siteDescription: config.value.siteDescription,
    siteUrl: config.value.siteUrl,
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
    ...(faviconRaw === null ? {} : { favicon: `/${basenameOf(faviconRaw)}` }),
    ...(expressiveCodeConfig === undefined
      ? {}
      : { expressiveCode: { themes: expressiveCodeConfig.themes } }),
    ...(analytics === null
      ? {}
      : { extraHeadEntries: analytics.headEntries }),
    ...(input.mikeVersions !== undefined ? { mikeVersions: input.mikeVersions } : {}),
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

  const paletteStrategy = input.palette;
  const stylesheetSource = serializeStyleSheet(palette, themeFonts ?? null, paletteStrategy);
  const rssEnabled =
    input.rss === false ? false :
    input.rss === true ? true :
    allFeatures.includes('rss');
  const rssEndpointSource = rssEnabled
    ? serializeRssEndpoint({
        siteName: config.value.siteName,
        siteDescription: config.value.siteDescription,
        siteUrl: config.value.siteUrl,
      })
    : null;
  const writeResult = await writeOutputs({
    outputDir: input.outputDir,
    files: siteResult.value.files,
    astroConfigSource,
    packageJsonSource,
    migrationNotesSource,
    stylesheetSource,
    rssEndpointSource,
    configFormat: input.configFormat ?? 'mjs',
  });
  if (!writeResult.ok) {
    return err({ code: 'file-write-failed', message: writeResult.error });
  }
  const assetCopyResult = await copyAssetsToPublic(
    docsDir,
    input.outputDir,
    assetPlan,
  );
  if (!assetCopyResult.ok) {
    return err({ code: 'file-write-failed', message: assetCopyResult.error });
  }

  const assetPostDiagnostics: Array<{
    sourcePath: string;
    diagnostic: ReturnType<typeof createDiagnostic>;
  }> = [];
  if (logoSrc !== null) {
    const logoCopy = await copyOne(
      join(docsDir, logoSrc),
      join(input.outputDir, 'src', 'assets', basenameOf(logoSrc)),
    );
    if (!logoCopy.ok) {
      assetPostDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'logo-source-missing',
          source: 'mkdocs-to-starlight',
          message: `theme.logo: ${logoSrc} could not be located. ${logoCopy.error}`,
        }),
      });
    }
  }
  if (faviconRaw !== null) {
    const faviconCopy = await copyOne(
      join(docsDir, faviconRaw),
      join(input.outputDir, 'public', basenameOf(faviconRaw)),
    );
    if (!faviconCopy.ok) {
      assetPostDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'favicon-source-missing',
          source: 'mkdocs-to-starlight',
          message: `theme.favicon: ${faviconRaw} could not be located. ${faviconCopy.error}`,
        }),
      });
    }
  }
  // If we collected post-build asset diagnostics, append them to the
  // existing MIGRATION_NOTES.md so users see them in the same place.
  if (assetPostDiagnostics.length > 0) {
    const extraSection =
      '\n## logo / favicon assets\n\n' +
      assetPostDiagnostics
        .map(
          (d) =>
            `- **${d.sourcePath}** — ${d.diagnostic.ruleId}: ${d.diagnostic.message}`,
        )
        .join('\n') +
      '\n';
    try {
      await writeFile(
        join(input.outputDir, 'MIGRATION_NOTES.md'),
        migrationNotesSource + extraSection,
        'utf8',
      );
    } catch {
      // Non-fatal — the original notes file already exists.
    }
  }

  return ok({
    diagnostics: siteResult.value.diagnostics,
    sidebarSource: serializeSidebar(sidebarWithPages),
    astroConfigSource,
    packageJsonSource,
    migrationNotesSource,
  });
}

function basenameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function snippetExtensionOptions(
  exts: ReadonlyArray<{ readonly name: string; readonly options: Readonly<Record<string, unknown>> }>,
): Readonly<Record<string, unknown>> {
  const entry = exts.find((e) => e.name === 'pymdownx.snippets');
  return entry?.options ?? {};
}

async function copyOne(source: string, target: string): Promise<Result<true, string>> {
  try {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    return ok(true);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`failed to copy ${source} → ${target}: ${message}`);
  }
}

function collectCandidateDirectories(
  sourcePaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const set = new Set<string>(['']);
  for (const path of sourcePaths) {
    let cursor = path.lastIndexOf('/');
    while (cursor !== -1) {
      set.add(path.slice(0, cursor));
      cursor = path.lastIndexOf('/', cursor - 1);
    }
  }
  return [...set];
}

async function copyAssetsToPublic(
  docsDir: string,
  outputDir: string,
  plan: ReadonlyArray<AssetCopy>,
): Promise<Result<true, string>> {
  for (const entry of plan) {
    const source = join(docsDir, entry.sourceRelative);
    const target = join(outputDir, 'public', entry.destRelative);
    try {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return err(`failed to copy ${source} → ${target}: ${message}`);
    }
  }
  return ok(true);
}

interface CompiledSidebar {
  readonly entries: ReadonlyArray<SidebarEntry>;
  readonly diagnostics: ReadonlyArray<import('../../domain/diagnostics/diagnostic.js').Diagnostic>;
}

async function compileSidebarEntries(
  navRaw: ReadonlyArray<unknown> | null,
  preParsed: ReadonlyArray<MkdocsNavEntry> | null,
  slugMap: Parameters<typeof compileNavigation>[1],
  sectionIndexEnabled: boolean,
): Promise<Result<CompiledSidebar, string>> {
  let tree: ReadonlyArray<MkdocsNavEntry>;
  if (preParsed !== null) {
    tree = preParsed;
  } else if (navRaw === null || navRaw.length === 0) {
    return ok({ entries: [], diagnostics: [] });
  } else {
    const parsed = parseNavTree(navRaw);
    if (!parsed.ok) {
      return err(parsed.error.message);
    }
    tree = parsed.value;
  }
  const transformed = sectionIndexEnabled
    ? applySectionIndex(tree)
    : { nav: tree, diagnostics: [] };
  const sidebar = compileNavigation(transformed.nav, slugMap);
  return ok({
    entries: sidebar.entries,
    diagnostics: [...transformed.diagnostics, ...sidebar.diagnostics],
  });
}

interface LiterateNavResult {
  readonly tree: ReadonlyArray<MkdocsNavEntry> | null;
  readonly diagnostics: ReadonlyArray<import('../../domain/diagnostics/diagnostic.js').Diagnostic>;
}

async function resolveLiterateNav(
  plugins: ReadonlyArray<{ readonly name: string }>,
  docsDir: string,
  fs: FileSystem,
): Promise<LiterateNavResult> {
  const enabled = plugins.some((p) => p.name === 'literate-nav');
  if (!enabled) {
    return { tree: null, diagnostics: [] };
  }
  const summaryPath = join(docsDir, 'SUMMARY.md');
  const read = await fs.readText(summaryPath);
  if (!read.ok) {
    return {
      tree: null,
      diagnostics: [
        createDiagnostic({
          severity: 'warning',
          ruleId: 'plugin-literate-nav-no-summary',
          source: 'config/literate-nav',
          message: `mkdocs-literate-nav plugin enabled but ${summaryPath} could not be read; falling back to nav: in mkdocs.yml.`,
        }),
      ],
    };
  }
  const parsed = parseLiterateNav(read.value);
  return {
    tree: parsed.nav,
    diagnostics: [
      createDiagnostic({
        severity: 'info',
        ruleId: 'plugin-literate-nav-applied',
        source: 'config/literate-nav',
        message: `mkdocs-literate-nav: SUMMARY.md parsed (${parsed.nav.length} top-level entries) and used as the navigation source.`,
      }),
      ...parsed.diagnostics,
    ],
  };
}

interface WriteOutputsInput {
  readonly outputDir: string;
  readonly files: Readonly<Record<string, string>>;
  readonly astroConfigSource: string;
  readonly packageJsonSource: string;
  readonly migrationNotesSource: string;
  readonly stylesheetSource: string;
  readonly rssEndpointSource: string | null;
  readonly configFormat: 'mjs' | 'ts';
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
    [['MIGRATION_NOTES.md'], input.migrationNotesSource],
    [['src', 'content.config.ts'], serializeContentConfig()],
    [['src', 'styles', 'mkdocs-migration.css'], input.stylesheetSource],
  ];
  if (input.rssEndpointSource !== null) {
    scaffold.push([['src', 'pages', 'rss.xml.ts'], input.rssEndpointSource]);
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
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    return ok(true);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return err(`failed to write ${target}: ${message}`);
  }
}

function buildDeferredDiagnostics(
  input: ConvertSiteFromDiskInput,
): Array<{ sourcePath: string; diagnostic: ReturnType<typeof createDiagnostic> }> {
  const diags: Array<{ sourcePath: string; diagnostic: ReturnType<typeof createDiagnostic> }> = [];
  const add = (message: string) =>
    diags.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'wizard-decision-applied',
        source: 'mkdocs-to-starlight',
        message,
      }),
    });

  if (input.cards !== undefined) {
    add(
      `Configured: --cards=${input.cards} requested. The MDX <Card>/<CardGrid> output path is not yet implemented in this build; falling back to HTML + shim. (Tracked for v2.)`,
    );
  }
  if (input.mdxMode !== undefined) {
    add(
      `Configured: --mdx-mode=${input.mdxMode} requested. MDX mode selection is not yet implemented in this build; using auto-detection. (Tracked for v2.)`,
    );
  }
  if (input.keepExplicitHeadingIds === true) {
    add(
      `Configured: --keep-explicit-heading-ids requested. Explicit heading ID preservation is not yet implemented in this build; IDs may be re-generated. (Tracked for v2.)`,
    );
  }
  if (input.noSmartSymbols === true) {
    add(
      `Configured: --no-smart-symbols requested. Smart-symbol suppression is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.noEmojiShortcodes === true) {
    add(
      `Configured: --no-emoji-shortcodes requested. Emoji shortcode suppression is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.noInlineMarks === true) {
    add(
      `Configured: --no-inline-marks requested. Inline marks suppression is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.noAutoAppend === true) {
    add(
      `Configured: --no-auto-append requested. Auto-append suppression is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.snippetMaxDepth !== undefined) {
    add(
      `Configured: --snippet-max-depth=${String(input.snippetMaxDepth)} requested. Snippet depth limiting is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.snippetDedentSubsections === true) {
    add(
      `Configured: --snippet-dedent-subsections requested. Snippet subsection dedenting is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.expressiveCodeTheme !== undefined) {
    add(
      `Configured: --expressive-code-theme=${input.expressiveCodeTheme} requested. ExpressiveCode theme override is not yet implemented in this build; using auto-detected theme. (Tracked for v2.)`,
    );
  }
  if (input.admonitionMapPath !== undefined) {
    add(
      `Configured: --admonition-map=${input.admonitionMapPath} requested. Custom admonition mapping is not yet implemented in this build; using built-in map. (Tracked for v2.)`,
    );
  }
  if (input.extraAssets !== undefined && input.extraAssets.length > 0) {
    add(
      `Configured: --extra-asset paths requested (${String(input.extraAssets.length)} items). Extra asset inclusion is not yet implemented in this build. (Tracked for v2.)`,
    );
  }
  if (input.locales !== undefined && input.locales.length > 0) {
    add(
      `Configured: --locale codes requested (${input.locales.join(', ')}). Locale override is not yet implemented in this build; using auto-detected i18n config. (Tracked for v2.)`,
    );
  }
  if (input.suppressRules !== undefined && input.suppressRules.length > 0) {
    add(
      `Configured: --suppress rules requested (${input.suppressRules.join(', ')}). Rule suppression is not yet implemented in this build; all diagnostics are emitted. (Tracked for v2.)`,
    );
  }
  if (input.sidebarTopics === false) {
    add(
      `Configured: sidebarTopics: false requested. The starlight-sidebar-topics auto-install path is not implemented in this build; sidebar remains flat. (Tracked for v2.)`,
    );
  }
  return diags;
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

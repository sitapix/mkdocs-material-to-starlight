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
import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import { parseRepoUrl } from '../../domain/config/repo-context.js';
import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok, type Result } from '../../domain/result.js';
import { mapAnalyticsToHeadEntries } from '../../domain/starlight/analytics-mapping.js';
import { mapMaterialPaletteToStarlight } from '../../domain/starlight/palette-mapping.js';
import { classifyThemeFeature } from '../../domain/starlight/theme-feature-catalog.js';
import { atomicCopyFile, atomicWriteText } from '../../infrastructure/fs/atomic-write.js';
import { createNodeConfigDiscoverer } from '../../infrastructure/fs/node-config-discoverer.js';
import { createNodeDirectoryReader } from '../../infrastructure/fs/node-directory-reader.js';
import { createNodeFileSystem } from '../../infrastructure/fs/node-file-system.js';
import { createMdxOutputValidator } from '../../infrastructure/mdx/at-mdx-js-validator.js';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { applyPagesOverrides } from '../../use-cases/compile-navigation/apply-pages.js';
import { filterSidebarSlugs } from '../../use-cases/compile-navigation/filter-sidebar-slugs.js';
import { loadAwesomePagesFiles } from '../../use-cases/config/load-awesome-pages.js';
import { parseLiterateNav } from '../../use-cases/config/parse-literate-nav.js';
import { compileSidebarEntries } from '../../use-cases/convert-site/compile-sidebar-entries.js';
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
import { classifyHook } from '../../use-cases/detect-features/hook-archetypes.js';
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

  const sectionIndexEnabled = config.value.plugins.some((p) => p.name === 'section-index');
  const literateNav = await resolveLiterateNav(config.value.plugins, docsDir, fs);
  const sidebarResult = await compileSidebarEntries(
    literateNav.tree === null ? config.value.nav : null,
    literateNav.tree,
    siteResult.value.slugMap,
    sectionIndexEnabled,
    (() => {
      const bp = config.value.plugins.find((p) => p.name === 'blog');
      if (bp === undefined) return {};
      const dir =
        typeof bp.options['blog_dir'] === 'string' ? (bp.options['blog_dir'] as string) : 'blog';
      return { blogDir: dir };
    })(),
  );
  if (!sidebarResult.ok) {
    return err({ code: 'nav-compile-failed', message: sidebarResult.error });
  }

  // When the blog plugin is enabled, the converter drops auto-generated
  // landing pages (`<blogDir>/posts/{index,tags,archive}.md`) from
  // emitPaths so starlight-blog can render them itself. The sidebar
  // compiler hasn't seen that drop — any `nav:` entry referencing those
  // files would survive into astro.config.mjs and crash the build with
  // "AstroUserError: The slug '<…>' does not exist." Filter them here,
  // before applyPagesOverrides locks the entry shape in. Sibling files
  // OUTSIDE `<blogDir>/posts/` (e.g. `<blogDir>/index.md`) are real nav
  // pages and stay in both emitPaths and the sidebar.
  const droppedBlogSlugs = (() => {
    const bp = config.value.plugins.find((p) => p.name === 'blog');
    if (bp === undefined) return new Set<string>();
    const dir =
      typeof bp.options['blog_dir'] === 'string' ? (bp.options['blog_dir'] as string) : 'blog';
    return new Set([`${dir}/posts/index`, `${dir}/posts/tags`, `${dir}/posts/archive`]);
  })();
  const filteredSidebarEntries = filterSidebarSlugs(sidebarResult.value.entries, droppedBlogSlugs);
  const sidebarWithPages = applyPagesOverrides(filteredSidebarEntries, pagesResult.value);

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
  const blogPlugin = config.value.plugins.find((p) => p.name === 'blog');
  const tagsPlugin = config.value.plugins.find((p) => p.name === 'tags');
  const socialPlugin = config.value.plugins.find((p) => p.name === 'social');
  // Material blog plugin: blog_dir defaults to `blog`. Authors live in
  // `<docs_dir>/<blog_dir>/.authors.yml`. starlight-blog needs them as
  // the `authors` field of the plugin invocation; without this, every
  // blog post fails with "Author 'X' not found in the blog configuration."
  const blogDir =
    typeof blogPlugin?.options['blog_dir'] === 'string'
      ? (blogPlugin.options['blog_dir'] as string)
      : 'blog';
  const authorsYmlPath = join(docsDir, blogDir, '.authors.yml');
  const authorsYmlRead = await fs.readText(authorsYmlPath);
  const authorsFromFile = authorsYmlRead.ok
    ? (() => {
        const decoded = yamlDecoder.decode(authorsYmlRead.value);
        if (!decoded.ok) return undefined;
        const root = decoded.value as Record<string, unknown> | null;
        if (root === null || typeof root !== 'object') return undefined;
        const authors = root['authors'];
        if (authors === null || typeof authors !== 'object') return undefined;
        return authors as Record<string, unknown>;
      })()
    : undefined;
  const blogOptionsBase = blogPlugin !== undefined ? blogPlugin.options : {};
  // Author resolution priority:
  //   1. `plugins.blog.authors:` is an object map → use it verbatim.
  //   2. Otherwise (missing OR a flag like `authors: true`), prefer the
  //      sidecar `.authors.yml` if present. Real-world (ksaaskil): mkdocs.yml
  //      has `authors: true` + `authors_file: "{blog}/.authors.yml"`, so the
  //      flag wins under "any defined" semantics and the file's contents
  //      never reach starlight-blog — every post then fails with
  //      "Author 'ksaaskil' not found in the blog configuration."
  const baseAuthors = blogOptionsBase['authors'];
  const baseAuthorsIsObjectMap =
    baseAuthors !== null && typeof baseAuthors === 'object' && !Array.isArray(baseAuthors);
  const blogOptions =
    blogPlugin !== undefined &&
    (Object.keys(blogOptionsBase).length > 0 || authorsFromFile !== undefined)
      ? authorsFromFile !== undefined && !baseAuthorsIsObjectMap
        ? { ...blogOptionsBase, authors: authorsFromFile }
        : blogOptionsBase
      : undefined;
  const tagsOptions =
    tagsPlugin !== undefined && Object.keys(tagsPlugin.options).length > 0
      ? tagsPlugin.options
      : undefined;
  const rawSocialLayout = socialPlugin?.options['cards_layout_options'];
  const socialCardsLayoutOptions =
    rawSocialLayout !== null && typeof rawSocialLayout === 'object'
      ? (rawSocialLayout as Readonly<Record<string, unknown>>)
      : undefined;

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
        source: 'mkdocs-material-to-starlight',
        message: `Material palette primary "${palette.sourceName}" translated to Starlight accent CSS variables (hue=${String(palette.accentHue)}).`,
      }),
    });
  } else if (palette !== null && palette.isCustom) {
    paletteDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'palette-custom-needs-manual',
        source: 'mkdocs-material-to-starlight',
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
        source: 'mkdocs-material-to-starlight',
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
    const hookFull = join(projectDir, hookRel);
    const read = await fs.readText(hookFull);
    if (!read.ok) {
      hookDiagnostics.push({
        sourcePath: hookRel,
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'hook-file-not-found',
          source: 'mkdocs-material-to-starlight',
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
        source: 'mkdocs-material-to-starlight',
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
        source: 'mkdocs-material-to-starlight',
        message:
          "theme.features `content.tabs.link` detected. Generated `<Tabs>` components include a derived `syncKey` so identically-labelled tab groups stay synchronised across pages, matching Material's behaviour.",
      }),
    });
  }
  if (config.value.copyright !== null) {
    themeFeatureDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'copyright-text-detected',
        source: 'mkdocs-material-to-starlight',
        message: `mkdocs.yml \`copyright:\` text detected: "${config.value.copyright}". Starlight has no first-class \`copyright\` config option. Recreate by overriding Footer.astro under \`src/components/overrides/\` with the supplied text rendered inside a \`<footer class="sl-flex">\` block, then register the override via Starlight \`components: { Footer: "./src/components/overrides/Footer.astro" }\`.`,
      }),
    });
  }
  if (config.value.repoUrl !== null) {
    const repoName = config.value.repoName ?? '(host inferred from URL)';
    themeFeatureDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'repo-button-recommendation',
        source: 'mkdocs-material-to-starlight',
        message: `mkdocs.yml \`repo_url\` is set${config.value.repoName !== null ? ` (repo_name: "${repoName}")` : ''}. The converter wires the URL into starlight \`editLink.baseUrl\`, but does not auto-synthesise a header repo-button — Starlight surfaces repo links via the \`social: [...]\` config. To match Material's repo button, add an entry like \`{ icon: "github", label: "${config.value.repoName ?? 'GitHub'}", href: "${config.value.repoUrl}" }\` to your starlight \`social\` array in astro.config (skip if you already added the same entry to mkdocs.yml's \`extra.social[]\`).`,
      }),
    });
  }
  // theme.icon.* overrides — Material lets users swap UI chrome icons
  // (menu/search/repo/edit/etc.) and per-admonition / per-tag icons.
  // Starlight uses its own icon catalog and slot mechanism; most overrides
  // must be reproduced via component overrides or per-occurrence props.
  const themeIcons = (() => {
    const ti = config.value.theme?.options['icon'];
    return typeof ti === 'object' && ti !== null && !Array.isArray(ti)
      ? (ti as Record<string, unknown>)
      : null;
  })();
  if (themeIcons !== null && Object.keys(themeIcons).length > 0) {
    const keys = Object.keys(themeIcons).sort().join(', ');
    themeFeatureDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'theme-icon-overrides-detected',
        source: 'mkdocs-material-to-starlight',
        message: `mkdocs.yml \`theme.icon\` overrides detected (${keys}). Starlight has its own icon catalog and slot system; UI-chrome icons (menu/search/repo/edit/view/previous/next/top/close) cannot be remapped via config. \`theme.icon.admonition.<type>\` overrides should be reproduced per-aside via \`<Aside icon="…">\`. \`theme.icon.tag.<id>\` overrides require a custom Tag.astro component (see \`extra-tags-alias-map\` diagnostic). \`theme.icon.logo\` is honoured if you set \`logo: { src }\` in starlight() — pass an SVG asset.`,
      }),
    });
  }
  const themeDirection = (() => {
    const d = config.value.theme?.options['direction'];
    return typeof d === 'string' ? d.toLowerCase() : null;
  })();
  if (themeDirection === 'rtl') {
    themeFeatureDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'theme-direction-rtl',
        source: 'mkdocs-material-to-starlight',
        message:
          "theme.direction `rtl` detected. Add `dir: 'rtl'` to the relevant Starlight `locales: { <code>: { label, lang, dir: 'rtl' } }` entry so the layout flips for right-to-left languages. Starlight has no top-level direction switch — the setting is per-locale.",
      }),
    });
  }
  if (hasNavigationTabs) {
    themeFeatureDiagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'feature-navigation-tabs-recommend-topics',
        source: 'mkdocs-material-to-starlight',
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
          source: 'mkdocs-material-to-starlight',
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
        source: 'mkdocs-material-to-starlight',
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
          source: 'mkdocs-material-to-starlight',
          message: `pygments_style "${expressiveCodeConfig.sourceStyle}" has no curated Shiki equivalent — defaulted to ['${light}', '${dark}']. Replace expressiveCode.themes in astro.config.mjs with a closer match from https://shiki.style/themes.`,
        }),
      });
    } else {
      expressiveCodeDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'expressive-code-theme-applied',
          source: 'mkdocs-material-to-starlight',
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
          source: 'mkdocs-material-to-starlight',
          message: `pymdownx.highlight option(s) dropped (no ExpressiveCode equivalent): ${expressiveCodeConfig.unsupportedOptions.join(', ')}.`,
        }),
      });
    }
  }

  const redirects = extractRedirects(config.value.plugins);
  const i18nFromPlugin = extractI18nConfig(config.value.plugins);
  const i18nFromAlternate =
    i18nFromPlugin === null ? extractAlternateLocales(config.value.extras) : null;
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
        source: 'mkdocs-material-to-starlight',
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
        source: 'mkdocs-material-to-starlight',
        message: `extra.analytics provider "${analytics.provider}" property "${analytics.property}" injected into starlight head[].`,
      }),
    });
    if (analytics.unsupported.includes('feedback')) {
      analyticsDiagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'extra-analytics-feedback-dropped',
          source: 'mkdocs-material-to-starlight',
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
        source: 'mkdocs-material-to-starlight',
        message: `theme.font mapped to Fontsource: ${parts.join(', ')}. Run \`npm install\` to fetch.`,
      }),
    });
  }

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
  const themeOptions = config.value.theme?.options ?? {};
  // Starlight's `logo.src` and `favicon` accept ONLY local file paths
  // (resolved relative to the project root or under `src/assets/`). External
  // URLs (`https://…/logo.svg`) are not allowed — Astro/Vite resolves the
  // value as a Vite module and `Rollup failed to resolve import "…"` at
  // build time. Real-world break (DarrenOfficial, Enveloppe, shenweiyan):
  // the source `theme.logo` is a CDN URL we have no way to download. Drop
  // the emission entirely when the value is an absolute URL — Starlight
  // falls back to its default chrome and the build succeeds.
  const isLocalAssetPath = (v: unknown): v is string =>
    typeof v === 'string' && !/^[a-z][a-z0-9+\-.]*:\/\//i.test(v);
  const logoSrcCandidate = isLocalAssetPath(themeOptions.logo) ? themeOptions.logo : null;
  const faviconRawCandidate = isLocalAssetPath(themeOptions.favicon) ? themeOptions.favicon : null;
  // Pre-check: a logo/favicon path that doesn't resolve to an existing
  // file would otherwise produce a config that emits `logo: { src: … }`
  // referencing a missing import, and Rollup fails the build with
  // "Rollup failed to resolve import". Real-world break (Enveloppe):
  // the source declares `theme.favicon: assets/meta/favicons.png` but
  // the file isn't in the repo. We `await fs.exists` here (well, attempt
  // a stat) so the config is built only for paths we can actually copy.
  const checkLocalAssetExists = async (rel: string | null): Promise<boolean> => {
    if (rel === null) return false;
    return fs.exists(join(docsDir, rel));
  };
  const logoSrc = (await checkLocalAssetExists(logoSrcCandidate)) ? logoSrcCandidate : null;
  // Starlight's `favicon` field accepts only .ico, .gif, .jpg/.jpeg, .png,
  // and .svg. Material sites occasionally use other formats (e.g. .webp,
  // .avif) — emitting those would crash `astro:config:setup` with
  // "favicon must be a .ico, .gif, .jpg, .png, or .svg file". Drop the
  // emission when the extension isn't accepted; Starlight falls back to
  // its default favicon and the build succeeds. Real-world break:
  // demosense/tidylake's source declared `favicon: img/favicon.webp`.
  const FAVICON_ACCEPTED_EXT = /\.(ico|gif|jpe?g|png|svg)$/i;
  const faviconExtensionRejected =
    faviconRawCandidate !== null && !FAVICON_ACCEPTED_EXT.test(faviconRawCandidate);
  const faviconRawAccepted =
    faviconRawCandidate !== null && !faviconExtensionRejected ? faviconRawCandidate : null;
  const faviconRaw = (await checkLocalAssetExists(faviconRawAccepted)) ? faviconRawAccepted : null;
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

function collectCandidateDirectories(sourcePaths: ReadonlyArray<string>): ReadonlyArray<string> {
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
    const copied = await atomicCopyFile(source, target);
    if (!copied.ok) {
      return copied;
    }
  }
  return ok(true);
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

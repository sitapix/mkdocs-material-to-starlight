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

import { join } from 'node:path';
import { err, ok, type Result } from '../../domain/result.js';
import { atomicCopyFile, atomicWriteText } from '../../infrastructure/fs/atomic-write.js';
import { buildSidebar } from '../../use-cases/compile-navigation/build-sidebar.js';
import { convertSite, type TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';
import { applyThemeAssetCopies } from '../../use-cases/copy-assets/apply-theme-asset-copies.js';
import type { AssetCopy } from '../../use-cases/copy-assets/plan.js';
import { extractPluginOptions } from '../../use-cases/detect-features/extract-plugin-options.js';
import { detectFeaturesFromPlugins } from '../../use-cases/detect-features/from-plugins.js';
import { detectFeaturesFromThemeFeatures } from '../../use-cases/detect-features/from-theme-features.js';
import {
  type GiscusConfig,
  parseGiscusFromPartial,
} from '../../use-cases/detect-features/giscus-override.js';
import { resolveThemeAssets } from '../../use-cases/detect-features/resolve-theme-assets.js';
import { runConfigAnalysis } from '../../use-cases/detect-features/run-config-analysis.js';
import { prepareConvertContext } from '../../use-cases/load-config/prepare-convert-context.js';
import { assembleConfigOutputs } from '../../use-cases/serialize-config/assemble-config-outputs.js';
import { serializeBiomeConfig } from '../../use-cases/serialize-config/biome-config.js';
import { buildOutputSources } from '../../use-cases/serialize-config/build-output-sources.js';
import { serializeContentConfig } from '../../use-cases/serialize-config/content-config.js';
import { serializeSidebar } from '../../use-cases/serialize-config/sidebar.js';
import { computeUnclaimedSlugs } from '../../use-cases/serialize-config/topics-exclude.js';

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
  /** When false, opt out of the starlight-sidebar-topics auto-install for
   *  Material `navigation.tabs` and keep the flat sidebar. */
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

export async function convertSiteFromDisk(
  input: ConvertSiteFromDiskInput,
): Promise<Result<ConvertSiteFromDiskOutput, ConvertSiteFromDiskError>> {
  const ctx = await prepareConvertContext({
    projectDir: input.projectDir,
    outputDir: input.outputDir,
    force: input.force === true,
    snippetBasePaths: input.snippetBasePaths,
    tabs: input.tabs,
    outputValidator: input.outputValidator,
  });
  if (!ctx.ok) return err(ctx.error);
  const {
    fs,
    dirReader,
    yamlDecoder,
    projectDir,
    docsDir,
    autoDiscovery,
    strippedPythonTags,
    config: configValue,
    sourcePaths,
    assetPlan,
    resolvedSnippetBasePaths,
    repoContext,
    autoAppendContent,
    i18nLocales,
    includeMarkdownEnabled,
    macrosScanEnabled,
    themeFeatures,
    hasTabsLink,
    hasNavigationTabs,
    emitMdxTabs,
    outputValidator,
  } = ctx.value;
  // Preserve the existing `config.value.…` shape used downstream so this
  // refactor is purely structural — no per-callsite renames.
  const config = { ok: true as const, value: configValue };
  const sourceListing = { ok: true as const, value: sourcePaths };

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
        typeof bp.options.blog_dir === 'string' ? (bp.options.blog_dir as string) : 'blog';
      return { blogDir: dir };
    })(),
    snippetDedentSubsections:
      snippetExtensionOptions(config.value.markdownExtensions).dedent_subsections === true,
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

  // Material comments live in a Giscus <script> inside the theme override
  // partial (`<custom_dir>/partials/comments.html`). starlight-giscus needs
  // all four data attributes; when they parse, auto-install — otherwise the
  // existing `comment-system` diagnostic keeps recommending the manual port.
  const customDir = config.value.theme?.options?.custom_dir;
  let giscusConfig: GiscusConfig | null = null;
  if (typeof customDir === 'string' && customDir.length > 0) {
    const partialPath = join(docsDir, '..', customDir, 'partials', 'comments.html');
    const partialRead = await fs.readText(partialPath);
    if (partialRead.ok) {
      giscusConfig = parseGiscusFromPartial(partialRead.value);
    }
  }

  // `site_url` with a path (`https://user.github.io/repo/`) needs Astro's
  // `base:` plus starlight-base-path for content links — without them every
  // absolute link 404s on subpath deploys (GitHub Pages project sites).
  const basePath = deriveBasePath(config.value.siteUrl);

  const allFeatures = [
    ...new Set([
      ...siteResult.value.detectedFeatures,
      ...featuresFromPlugins,
      ...featuresFromThemeFlags,
      ...(giscusConfig !== null ? (['giscus'] as const) : []),
      ...(basePath !== null ? (['base-path'] as const) : []),
    ]),
  ]
    // `navigation.tabs` → starlight-sidebar-topics is on by default;
    // `--no-sidebar-topics` keeps the flat sidebar instead.
    .filter((f) => f !== 'sidebar-topics' || input.sidebarTopics !== false)
    .sort();

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

  const analysis = await runConfigAnalysis({
    config: config.value,
    fs,
    dirReader,
    projectDir,
    docsDir,
    sourcePaths: sourceListing.value,
    themeFeatures,
    hasTabsLink,
    hasNavigationTabs,
    includeMarkdownEnabled,
    strippedPythonTags,
    autoDiscovery,
    precomputedDiagnostics: [
      ...siteResult.value.diagnostics,
      ...sidebarBuilt.value.sectionIndexDiagnostics,
      ...sidebarBuilt.value.literateNavDiagnostics,
    ],
    deferredInput: input,
  });
  const allDiagnostics = analysis.allDiagnostics;
  const {
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
  } = analysis.detected;
  // Split extra CSS into two buckets:
  //   - external URLs (e.g. https://fonts.…/foo.css) pass through to
  //     Starlight `customCss` — Vite leaves the URL alone.
  //   - local CSS files (`docs/css/extra.css`) get copied to `public/`
  //     by the asset planner. Starlight's `customCss` cannot resolve
  //     public-folder paths (Rollup tries to bundle them and fails). We
  //     instead emit a `<link rel="stylesheet" href="/<path>">` entry in
  //     `head[]` so the file loads as a static asset at runtime.
  const { logoSrc, faviconRaw, faviconRawCandidate, faviconExtensionRejected } =
    await resolveThemeAssets({
      themeOptions: config.value.theme?.options ?? {},
      fs,
      docsDir,
    });
  const { astroConfigSource, packageJsonSource, migrationNotesSource, extendedFrontmatterFields } =
    assembleConfigOutputs({
      siteName: config.value.siteName,
      siteDescription: config.value.siteDescription,
      siteUrl: config.value.siteUrl,
      useDirectoryUrls: config.value.useDirectoryUrls,
      sidebar: sidebarWithPages,
      detectedFeatures: allFeatures,
      ...(giscusConfig !== null ? { giscus: giscusConfig } : {}),
      ...(basePath !== null ? { basePath } : {}),
      ...(allFeatures.includes('sidebar-topics')
        ? {
            topicExcludeSlugs: computeUnclaimedSlugs(
              sidebarWithPages,
              siteResult.value.slugMap.entries().map((r) => r.slug),
            ),
          }
        : {}),
      redirects,
      enableLinksValidator: input.linksValidator === true,
      extraAssets,
      themeFonts,
      i18n,
      social,
      editLinkBaseUrl,
      tableOfContents,
      logoSrc,
      faviconRaw,
      logoReplacesTitle: input.logoReplacesTitle === true,
      expressiveCodeConfig,
      analytics,
      mikeVersions: input.mikeVersions,
      blogOptions,
      tagsOptions,
      packageName: input.packageName,
      files: siteResult.value.files,
      allDiagnostics,
      extras: config.value.extras,
    });

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
    includeBlogSchema: allFeatures.includes('blog'),
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
    // The full diagnostic stream now flows through `analysis.allDiagnostics`,
    // which already includes site-conversion + auto-discovery + plugin-level
    // diagnostics in the canonical order. Callers see every signal — the
    // auto-discovery redirect message is the first entry when it fired.
    diagnostics: allDiagnostics,
    sidebarSource: serializeSidebar(sidebarWithPages),
    astroConfigSource,
    packageJsonSource,
    migrationNotesSource,
  });
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

/**
 * Extract the subpath from a valid absolute `site_url`, or null when the
 * site is served from the origin root. Trailing slashes are dropped so
 * `https://u.github.io/repo/` yields `/repo` — the shape Astro's `base:`
 * expects.
 */
function deriveBasePath(siteUrl: string | null): string | null {
  if (siteUrl === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(siteUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const path = parsed.pathname.replace(/\/+$/, '');
  return path === '' ? null : path;
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
  /**
   * When true (blog feature detected), the emitted `content.config.ts`
   * composes starlight-blog's `blogSchema` into `docsSchema({ extend })` so
   * blog frontmatter (most critically `date`) is coerced to its typed form.
   */
  readonly includeBlogSchema: boolean;
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
        includeBlogSchema: input.includeBlogSchema,
      }),
    ],
    [['src', 'styles', 'mkdocs-migration.css'], input.stylesheetSource],
  ];
  // Starlight probes `getEntry('docs', '404')` for a custom not-found page
  // on every build; without one, Astro's content runtime warns "Entry docs
  // → 404 was not found." at the end of EVERY `astro build` (field-tested
  // 2026-07-23 across four real projects). Scaffold a minimal 404 so the
  // build is quiet and users get a styled not-found page — but never
  // clobber a 404 the source site actually converted.
  const hasConverted404 = Object.keys(input.files).some((p) => p === '404.md' || p === '404.mdx');
  if (!hasConverted404) {
    scaffold.push([
      ['src', 'content', 'docs', '404.md'],
      [
        '---',
        'title: Page not found',
        'template: splash',
        'editUrl: false',
        '---',
        '',
        "The page you're looking for doesn't exist or has moved.",
        '',
        '[Back to the homepage](/)',
        '',
      ].join('\n'),
    ]);
  }
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

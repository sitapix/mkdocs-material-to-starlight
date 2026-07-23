/**
 * Final-stage assembly of the three top-level source files the
 * converter writes:
 *
 *   - astro.config.{mjs,ts}   (via serializeAstroConfig)
 *   - package.json            (via serializePackageJson)
 *   - MIGRATION_NOTES.md      (via serializeMigrationNotes)
 *
 * Plus the auto-extended frontmatter type list for content.config.ts and
 * the derived font-dependency / extra-CSS / extra-JS entries that feed
 * the astro config. Pulled out of `interface/api/convert-site.ts` so
 * the orchestrator stays under the size budget.
 *
 * Pure: every input is already-resolved data; outputs are strings or
 * lists of strings.
 */

import { posix } from 'node:path';
import type { MaterialFontConfig } from '../../domain/starlight/font-mapping.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import type { TaggedDiagnostic } from '../convert-site/convert.js';
import { collectUnknownFrontmatterFieldNames } from '../convert-site/diagnostic-enrichment.js';
import type { extractExpressiveCodeConfig } from '../detect-features/expressive-code-config.js';
import { inferFrontmatterTypes } from '../validate-output/infer-frontmatter-types.js';
import { type AstroConfigInput, serializeAstroConfig } from './astro-config.js';
import { serializeMigrationNotes } from './migration-notes.js';
import { serializePackageJson } from './package-json.js';
import type { DetectedFeature } from './versions.js';
import { CORE_VERSIONS } from './versions.js';

const ABSOLUTE_URL = /^[a-z][a-z0-9+\-.]*:\/\//i;

type ExpressiveCodeConfig = NonNullable<ReturnType<typeof extractExpressiveCodeConfig>>;
type RedirectsArg = NonNullable<AstroConfigInput['redirects']>;
type I18nArg = NonNullable<AstroConfigInput['i18n']>;
type SocialArg = NonNullable<AstroConfigInput['social']>;
type ToCArg = NonNullable<AstroConfigInput['tableOfContents']>;
type ExtraHeadEntry = NonNullable<AstroConfigInput['extraHeadEntries']>[number];

interface AnalyticsHeadEntries {
  readonly headEntries: ReadonlyArray<ExtraHeadEntry>;
}

interface ExtraAssets {
  readonly css: ReadonlyArray<string>;
  readonly js: ReadonlyArray<{
    readonly src: string;
    readonly type?: 'module';
    readonly async?: boolean;
    readonly defer?: boolean;
  }>;
}

export interface AssembleConfigOutputsInput {
  readonly siteName: string;
  readonly siteDescription: string | null;
  readonly siteUrl: string | null;
  readonly useDirectoryUrls: boolean;
  readonly sidebar: ReadonlyArray<SidebarEntry>;
  readonly detectedFeatures: ReadonlyArray<DetectedFeature>;
  readonly redirects: RedirectsArg;
  readonly enableLinksValidator: boolean;
  readonly extraAssets: ExtraAssets;
  readonly themeFonts: MaterialFontConfig | null | undefined;
  readonly i18n: I18nArg | null;
  readonly social: SocialArg;
  readonly editLinkBaseUrl: string | null;
  readonly tableOfContents: ToCArg | undefined;
  readonly logoSrc: string | null;
  readonly faviconRaw: string | null;
  readonly logoReplacesTitle: boolean;
  readonly expressiveCodeConfig: ExpressiveCodeConfig | undefined;
  readonly analytics: AnalyticsHeadEntries | null;
  readonly mikeVersions: ReadonlyArray<string> | undefined;
  readonly blogOptions: Readonly<Record<string, unknown>> | undefined;
  readonly tagsOptions: Readonly<Record<string, unknown>> | undefined;
  readonly packageName: string | undefined;
  readonly files: Readonly<Record<string, string>>;
  readonly allDiagnostics: ReadonlyArray<TaggedDiagnostic>;
  readonly extras: Readonly<Record<string, unknown>>;
  /** Giscus config parsed from the comments override partial (giscus feature). */
  readonly giscus?: NonNullable<AstroConfigInput['giscus']>;
  /** Subpath from `site_url` (base-path feature). */
  readonly basePath?: string;
  /** Nav-unlisted page slugs for sidebar-topics' exclude list. */
  readonly topicExcludeSlugs?: ReadonlyArray<string>;
}

export interface AssembleConfigOutputsResult {
  readonly astroConfigSource: string;
  readonly packageJsonSource: string;
  readonly migrationNotesSource: string;
  readonly extendedFrontmatterFields: Record<string, string>;
}

export function assembleConfigOutputs(
  input: AssembleConfigOutputsInput,
): AssembleConfigOutputsResult {
  // External CSS keeps its absolute URL; project-relative paths get
  // proxied to the output's `public/` tree via head[] link entries so
  // the file loads as a static asset at runtime.
  const extraCssExternal: string[] = [];
  const extraCssPublicHrefs: string[] = [];
  for (const p of input.extraAssets.css) {
    if (ABSOLUTE_URL.test(p)) extraCssExternal.push(p);
    else extraCssPublicHrefs.push(`/${p.replace(/^\/+/, '')}`);
  }

  // Fontsource packages are imported as bare specifiers — Vite resolves
  // them as the package's CSS export, so they slot into customCss verbatim.
  const fontCssImports: string[] = [];
  if (input.themeFonts?.text !== undefined) fontCssImports.push(input.themeFonts.text.package);
  if (input.themeFonts?.code !== undefined) fontCssImports.push(input.themeFonts.code.package);
  const fontDependencies: ReadonlyArray<readonly [string, string]> = fontCssImports.map(
    (p) => [p, CORE_VERSIONS.fontsource] as const,
  );

  const extraJsEntries: NonNullable<AstroConfigInput['extraJsEntries']> = input.extraAssets.js.map(
    (js) => ({
      ...js,
      src: ABSOLUTE_URL.test(js.src) ? js.src : `/${js.src.replace(/^\/+/, '')}`,
    }),
  );

  const logoEntry =
    input.logoSrc === null
      ? {}
      : {
          logo: {
            src: `./src/assets/${posix.basename(input.logoSrc)}`,
            ...(input.logoReplacesTitle ? { replacesTitle: true as const } : {}),
          },
        };

  const astroConfigSource = serializeAstroConfig({
    siteName: input.siteName,
    siteDescription: input.siteDescription,
    siteUrl: input.siteUrl,
    useDirectoryUrls: input.useDirectoryUrls,
    sidebar: input.sidebar,
    detectedFeatures: input.detectedFeatures,
    redirects: input.redirects,
    enableLinksValidator: input.enableLinksValidator,
    extraCssEntries: [...extraCssExternal, ...fontCssImports],
    extraJsEntries,
    ...(input.i18n === null ? {} : { i18n: input.i18n }),
    ...(input.social.length > 0 ? { social: input.social } : {}),
    ...(input.editLinkBaseUrl === null ? {} : { editLinkBaseUrl: input.editLinkBaseUrl }),
    ...(input.tableOfContents === undefined ? {} : { tableOfContents: input.tableOfContents }),
    ...logoEntry,
    ...(input.faviconRaw === null ? {} : { favicon: `/${posix.basename(input.faviconRaw)}` }),
    ...(input.expressiveCodeConfig === undefined
      ? {}
      : { expressiveCode: { themes: input.expressiveCodeConfig.themes } }),
    ...(input.analytics !== null || extraCssPublicHrefs.length > 0
      ? {
          extraHeadEntries: [
            ...(input.analytics?.headEntries ?? []),
            ...extraCssPublicHrefs.map((href) => ({
              tag: 'link' as const,
              attrs: { rel: 'stylesheet', href },
            })),
          ],
        }
      : {}),
    ...(input.mikeVersions !== undefined ? { mikeVersions: input.mikeVersions } : {}),
    ...(input.blogOptions !== undefined ? { blogOptions: input.blogOptions } : {}),
    ...(input.tagsOptions !== undefined ? { tagsOptions: input.tagsOptions } : {}),
    ...(input.giscus !== undefined ? { giscus: input.giscus } : {}),
    ...(input.basePath !== undefined ? { basePath: input.basePath } : {}),
    ...(input.topicExcludeSlugs !== undefined
      ? { topicExcludeSlugs: input.topicExcludeSlugs }
      : {}),
  });

  const packageJsonSource = serializePackageJson({
    siteName: input.siteName,
    siteDescription: input.siteDescription,
    detectedFeatures: input.detectedFeatures,
    extraDependencies: fontDependencies,
    ...(input.packageName !== undefined ? { packageName: input.packageName } : {}),
  });

  const sourceDocs = Object.values(input.files).map((source) => ({ source }));
  const migrationNotesSource = serializeMigrationNotes({
    diagnostics: input.allDiagnostics,
    extras: input.extras,
    sourceDocs,
  });

  // Auto-extend `src/content.config.ts` schema with every frontmatter
  // field that triggered an `unknown-frontmatter-field` diagnostic.
  const extendedFrontmatterFields = inferFrontmatterTypes(
    collectUnknownFrontmatterFieldNames(input.allDiagnostics),
    sourceDocs,
  );

  return {
    astroConfigSource,
    packageJsonSource,
    migrationNotesSource,
    extendedFrontmatterFields,
  };
}

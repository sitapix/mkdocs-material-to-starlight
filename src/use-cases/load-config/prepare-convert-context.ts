/**
 * Front-end of the conversion pipeline: load `mkdocs.yml`, run the
 * idempotency guard, list source + asset files (with mkdocs-exclude
 * filtering applied), plan asset copies, and derive every feature flag
 * the per-file converter and downstream phases need.
 *
 * Pulled out of `interface/api/convert-site.ts` so the orchestrator
 * stays under the size budget. Returns a Result — three distinct
 * failure modes (config load failure, output dir not empty, dir read
 * failure) match the orchestrator's existing exit codes.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok, type Result } from '../../domain/result.js';
import { createNodeConfigDiscoverer } from '../../infrastructure/fs/node-config-discoverer.js';
import { createNodeDirectoryReader } from '../../infrastructure/fs/node-directory-reader.js';
import { createNodeFileSystem } from '../../infrastructure/fs/node-file-system.js';
import { createMdxOutputValidator } from '../../infrastructure/mdx/at-mdx-js-validator.js';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { parseRepoUrl, type RepoContext } from '../../domain/config/repo-context.js';
import type { MkdocsConfig, MkdocsPlugin } from '../../domain/config/mkdocs-config.js';
import {
  applyExcludePatterns,
  extractExcludePatterns,
} from '../detect-features/exclude-config.js';
import { extractAutoAppend } from '../detect-features/auto-append.js';
import { extractI18nLocales } from '../detect-features/i18n-config.js';
import { type AssetCopy, planAssetCopies } from '../copy-assets/plan.js';
import { loadMkdocsConfig } from './load-mkdocs-config.js';
import { enrichMissingDocsDirMessage } from '../convert-site/diagnostic-enrichment.js';
import type { OutputValidator } from '../../domain/ports/output-validator.js';

const ASSET_EXTENSIONS: ReadonlyArray<string> = [
  '.css', '.js', '.json', '.yaml', '.yml', '.md', '.mdx',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif',
  '.pdf', '.mp4', '.webm',
];

export interface PrepareConvertContextInput {
  readonly projectDir: string;
  readonly outputDir: string;
  readonly force: boolean;
  readonly snippetBasePaths: ReadonlyArray<string> | undefined;
  readonly tabs: 'mdx' | 'html' | undefined;
  readonly outputValidator: OutputValidator | null | undefined;
}

export interface ConvertContext {
  // Ports
  readonly fs: FileSystem;
  readonly dirReader: ReturnType<typeof createNodeDirectoryReader>;
  readonly yamlDecoder: ReturnType<typeof createJsYamlDecoder>;
  // Config
  readonly projectDir: string;
  readonly docsDir: string;
  readonly autoDiscovery: { readonly fromDir: string; readonly discoveredRelPath: string } | null;
  readonly strippedPythonTags: ReadonlyArray<string>;
  readonly config: MkdocsConfig;
  // File listings (post-exclude)
  readonly sourcePaths: ReadonlyArray<string>;
  readonly allFiles: ReadonlyArray<string>;
  readonly assetPlan: ReadonlyArray<AssetCopy>;
  // Per-file context
  readonly resolvedSnippetBasePaths: ReadonlyArray<string> | undefined;
  readonly repoContext: RepoContext | null;
  readonly autoAppendContent: string;
  // Feature flags + booleans the orchestrator + downstream phases consume
  readonly i18nLocales: ReadonlyArray<string>;
  readonly includeMarkdownEnabled: boolean;
  readonly macrosScanEnabled: boolean;
  readonly themeFeatures: ReadonlyArray<string>;
  readonly hasTabsLink: boolean;
  readonly hasNavigationTabs: boolean;
  readonly emitMdxTabs: boolean;
  readonly outputValidator: OutputValidator | null;
}

export type PrepareConvertContextError =
  | { readonly code: 'config-not-found'; readonly message: string }
  | {
      readonly code: 'config-ambiguous';
      readonly message: string;
      readonly candidates: ReadonlyArray<string>;
    }
  | { readonly code: 'yaml-decode-failed'; readonly message: string }
  | { readonly code: 'config-invalid'; readonly message: string }
  | { readonly code: 'output-not-empty'; readonly message: string }
  | { readonly code: 'directory-read-failed'; readonly message: string };

export async function prepareConvertContext(
  input: PrepareConvertContextInput,
): Promise<Result<ConvertContext, PrepareConvertContextError>> {
  const fs = createNodeFileSystem();
  const dirReader = createNodeDirectoryReader();
  const yamlDecoder = createJsYamlDecoder();
  const configDiscoverer = createNodeConfigDiscoverer();

  const loaded = await loadMkdocsConfig(
    { inputDir: input.projectDir },
    { fs, dirReader, yamlDecoder, configDiscoverer },
  );
  if (!loaded.ok) return err(translateLoadError(loaded.error, input.projectDir));

  const { projectDir, autoDiscovery, strippedPythonTags, config } = loaded.value;

  // Idempotency guard: if output dir exists and is non-empty, demand --force.
  if (!input.force) {
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

  const docsDir = join(projectDir, config.docsDir);
  const sourceListingRaw = await dirReader.list(docsDir, ['.md', '.mdx']);
  if (!sourceListingRaw.ok) {
    return err({
      code: 'directory-read-failed',
      message: enrichMissingDocsDirMessage(sourceListingRaw.error.message, config.plugins),
    });
  }
  // Apply mkdocs-exclude patterns BEFORE every downstream step that walks
  // the file list (sidebar, asset planning, slug map). Filtering here
  // means excluded pages never appear in the output, the sidebar, or the
  // slug map — matching mkdocs-exclude's semantics.
  const sourcePaths = applyExcludePatterns(
    sourceListingRaw.value,
    extractExcludePatterns(config.plugins),
  );
  const allFiles = await dirReader.list(docsDir, ASSET_EXTENSIONS);
  if (!allFiles.ok) {
    return err({
      code: 'directory-read-failed',
      message: enrichMissingDocsDirMessage(allFiles.error.message, config.plugins),
    });
  }

  const themeOpts = config.theme?.options ?? {};
  const logoExcludePath = typeof themeOpts.logo === 'string' ? themeOpts.logo : null;
  const faviconExcludePath = typeof themeOpts.favicon === 'string' ? themeOpts.favicon : null;
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
  const repoContext = parseRepoUrl(config.repoUrl);
  const autoAppendContent = await readAutoAppendContent(
    extractAutoAppend(config.markdownExtensions),
    docsDir,
    fs,
  );

  const themeFeatures = extractThemeFeatures(config);
  return ok({
    fs,
    dirReader,
    yamlDecoder,
    projectDir,
    docsDir,
    autoDiscovery,
    strippedPythonTags,
    config,
    sourcePaths,
    allFiles: allFiles.value,
    assetPlan,
    resolvedSnippetBasePaths,
    repoContext,
    autoAppendContent,
    i18nLocales: extractI18nLocales(config.plugins),
    includeMarkdownEnabled: config.plugins.some((p: MkdocsPlugin) => p.name === 'include-markdown'),
    macrosScanEnabled: config.plugins.some((p: MkdocsPlugin) => p.name === 'macros'),
    themeFeatures,
    hasTabsLink: themeFeatures.includes('content.tabs.link'),
    hasNavigationTabs: themeFeatures.includes('navigation.tabs'),
    // Default to MDX so tabs render via Starlight's native <Tabs>+<TabItem>
    // components. The legacy `html` mode is retained only for callers
    // who explicitly opt in via `tabs: 'html'`.
    emitMdxTabs: input.tabs !== 'html',
    // Default-wire the production validator. Callers can pass an explicit
    // validator (test seam) or `null` to skip validation entirely.
    outputValidator:
      input.outputValidator === undefined
        ? createMdxOutputValidator()
        : input.outputValidator,
  });
}

function extractThemeFeatures(config: MkdocsConfig): ReadonlyArray<string> {
  const f = config.theme?.options.features;
  return Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : [];
}

function translateLoadError(
  e:
    | { readonly kind: 'config-ambiguous'; readonly searchedDir: string; readonly candidates: ReadonlyArray<string> }
    | { readonly kind: 'config-not-found'; readonly searchedDir: string }
    | { readonly kind: 'yaml-decode-failed'; readonly message: string }
    | { readonly kind: 'config-invalid'; readonly message: string },
  inputDir: string,
): PrepareConvertContextError {
  switch (e.kind) {
    case 'config-ambiguous': {
      const list = e.candidates.map((c, i) => `  ${String(i + 1)}. ${c}`).join('\n');
      const firstDir = (() => {
        const first = e.candidates[0] ?? '';
        const slash = first.lastIndexOf('/');
        return slash === -1 ? '' : first.slice(0, slash);
      })();
      return {
        code: 'config-ambiguous',
        message:
          `Multiple mkdocs.yml/.yaml found under ${e.searchedDir}. ` +
          `Re-run pointing at the intended subdirectory directly:\n${list}\n` +
          `Example: \`mkdocs-material-to-starlight ${e.searchedDir}/${firstDir} <output-dir>\``,
        candidates: e.candidates,
      };
    }
    case 'config-not-found':
      return {
        code: 'config-not-found',
        message: `mkdocs.yml not found at ${inputDir} or in any reasonable subdirectory.`,
      };
    case 'yaml-decode-failed':
      return { code: 'yaml-decode-failed', message: e.message };
    case 'config-invalid':
    default:
      return { code: 'config-invalid', message: e.message };
  }
}

async function readAutoAppendContent(
  paths: ReadonlyArray<string>,
  docsDir: string,
  fs: FileSystem,
): Promise<string> {
  if (paths.length === 0) return '';
  const bodies: string[] = [];
  for (const rel of paths) {
    const read = await fs.readText(join(docsDir, rel));
    if (read.ok) bodies.push(read.value);
  }
  return bodies.join('\n\n');
}

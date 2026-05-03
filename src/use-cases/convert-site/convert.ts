/**
 * Site-level converter — orchestrates conversion of every Markdown file in a
 * MkDocs site into Starlight artifacts.
 *
 * Pipeline:
 *   1. Build the run-wide SlugMap from the discovered source paths
 *   2. For each source file:
 *      a. Read its content via the FileSystem port
 *      b. Run convertFile (per-file orchestrator)
 *      c. Collect per-file diagnostics, tagged with the source path
 *
 * Snippet expansion is deliberately separate from this composer; callers that
 * want it run `expandSnippets` over each source string before calling this
 * function (or it can be added as a flag in a follow-up).
 *
 * Returns either a Result.ok with `{ files, diagnostics }` or a Result.err
 * for fatal conditions (slug-map conflict, unreadable file). Per-file
 * conversion warnings (broken links, unmapped icons) flow through
 * `diagnostics`, not through the error channel.
 */

import { ok, err, type Result } from '../../domain/result.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { RepoContext } from '../../domain/config/repo-context.js';
import { buildSlugMap, type SlugMap } from '../../domain/starlight/slug-map.js';
import { convertFile } from '../convert-file/convert.js';
import { detectFeatures } from '../detect-features/detect.js';
import { expandSnippets } from '../expand-snippets/expand.js';
import type { DetectedFeature } from '../serialize-config/package-json.js';
import { validateFrontmatter } from '../validate-output/frontmatter.js';
import { validateJsxComponents } from '../validate-output/jsx-components.js';
import { renameI18nPath } from '../detect-features/i18n-rename.js';
import { expandIncludeMarkdown } from '../include-markdown/expand.js';
import { scanMacroOccurrences } from '../detect-macros/scan.js';
import { normalizeTyperSnippetDirectives } from '../normalize/typer-snippet-directives.js';

export interface ConvertSiteInput {
  readonly docsDir: string;
  readonly sourcePaths: ReadonlyArray<string>;
  readonly fs: FileSystem;
  readonly snippetBasePaths?: ReadonlyArray<string>;
  readonly repoContext?: RepoContext | null;
  /**
   * Pre-resolved content of every `pymdownx.snippets.auto_append` file,
   * concatenated. Appended to every source file before snippet expansion
   * (mirroring Material's site-wide glossary semantics). Empty / undefined
   * means no auto-append.
   */
  readonly autoAppendContent?: string;
  /**
   * Non-default locale codes from a `mkdocs-static-i18n` plugin entry. When
   * present, source paths matching `*.<locale>.md` are emitted under
   * `<locale>/...` to match Starlight's directory-based i18n layout.
   */
  readonly i18nLocales?: ReadonlyArray<string>;
  /**
   * When true, run the `mkdocs-include-markdown-plugin` expander on every
   * source file before per-file conversion. Resolves `{% include %}` and
   * `{% include-markdown %}` directives against `docsDir`.
   */
  readonly includeMarkdownEnabled?: boolean;
  /**
   * When true, scan each source file for `mkdocs-macros-plugin` Jinja2
   * occurrences and emit per-occurrence diagnostics with line/column. The
   * converter does not evaluate Jinja2; this exists so users can find every
   * site of substitution from MIGRATION_NOTES.
   */
  readonly macrosScanEnabled?: boolean;
  /**
   * When true (theme.features content.tabs.link), per-file conversion emits
   * Starlight `<Tabs syncKey>` MDX components instead of plain HTML divs.
   */
  readonly emitMdxTabs?: boolean;
  /**
   * Mirrors PyMdown `pymdownx.snippets.dedent_subsections`. When true,
   * extracted line-ranges and named sections have common leading whitespace
   * stripped.
   */
  readonly snippetDedentSubsections?: boolean;
}

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export interface ConvertSiteOutput {
  readonly files: Readonly<Record<string, string>>;
  readonly diagnostics: ReadonlyArray<TaggedDiagnostic>;
  readonly slugMap: SlugMap;
  readonly detectedFeatures: ReadonlyArray<DetectedFeature>;
}

export interface ConvertSiteError {
  readonly code: 'slug-conflict' | 'file-read-failed';
  readonly message: string;
}

export async function convertSite(
  input: ConvertSiteInput,
): Promise<Result<ConvertSiteOutput, ConvertSiteError>> {
  const slugMapOptions = input.i18nLocales === undefined ? undefined : { i18nLocales: input.i18nLocales };
  const slugResult = buildSlugMap(input.sourcePaths, slugMapOptions);
  if (!slugResult.ok) {
    return err({ code: 'slug-conflict', message: slugResult.error.message });
  }

  const files: Record<string, string> = {};
  const diagnostics: TaggedDiagnostic[] = [];
  const featureUnion = new Set<DetectedFeature>();

  for (const sourcePath of input.sourcePaths) {
    const fullPath = joinPath(input.docsDir, sourcePath);
    const read = await input.fs.readText(fullPath);
    if (!read.ok) {
      return err({
        code: 'file-read-failed',
        message: `failed to read "${fullPath}": ${read.error.message}`,
      });
    }

    let source = read.value;
    // Normalize typer-style {* path *} snippet directives before any other
    // processing. This must run on the original source so line numbers match
    // the user's file, and before the mkautodoc normalizer fences them.
    const snippetResult = normalizeTyperSnippetDirectives(source);
    source = snippetResult.text;
    for (const diagnostic of snippetResult.diagnostics) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    if (input.macrosScanEnabled === true) {
      // Scan the ORIGINAL source so line numbers match the user's file. The
      // include-markdown expansion below would shift them otherwise.
      for (const diagnostic of scanMacroOccurrences(read.value)) {
        diagnostics.push({ sourcePath, diagnostic });
      }
    }
    if (input.includeMarkdownEnabled === true) {
      const expansion = await expandIncludeMarkdown({
        source,
        docsDir: input.docsDir,
        fs: input.fs,
      });
      source = expansion.text;
      for (const diagnostic of expansion.diagnostics) {
        diagnostics.push({ sourcePath, diagnostic });
      }
    }
    if (input.autoAppendContent !== undefined && input.autoAppendContent.length > 0) {
      // Material's site-wide glossary pattern: append shared content (often
      // a list of `*[ABBR]: definition` entries) to every page so the
      // abbreviation expander has a global definition pool.
      source = source + '\n\n' + input.autoAppendContent;
    }
    if (input.snippetBasePaths !== undefined) {
      const expansion = await expandSnippets({
        source,
        basePaths: input.snippetBasePaths,
        fs: input.fs,
        dedentSubsections: input.snippetDedentSubsections === true,
      });
      source = expansion.text;
      for (const diagnostic of expansion.diagnostics) {
        diagnostics.push({ sourcePath, diagnostic });
      }
    }

    const converted = convertFile({
      source,
      sourcePath,
      slugMap: slugResult.value,
      repoContext: input.repoContext ?? null,
      emitMdxTabs: input.emitMdxTabs === true,
    });
    const i18nRename =
      input.i18nLocales === undefined
        ? null
        : renameI18nPath(sourcePath, input.i18nLocales);
    const intermediatePath = i18nRename ?? sourcePath;
    const outputPath =
      converted.extension === 'mdx'
        ? intermediatePath.replace(/\.md$/, '.mdx')
        : intermediatePath;
    files[outputPath] = converted.text;
    for (const diagnostic of converted.diagnostics) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    for (const diagnostic of validateFrontmatter(converted.text)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    for (const diagnostic of validateJsxComponents(converted.text, sourcePath)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    for (const feature of detectFeatures(source)) {
      featureUnion.add(feature);
    }
  }

  return ok({
    files,
    diagnostics,
    slugMap: slugResult.value,
    detectedFeatures: [...featureUnion].sort(),
  });
}

function joinPath(base: string, rel: string): string {
  if (base.length === 0) {
    return rel;
  }
  return base.endsWith('/') ? `${base}${rel}` : `${base}/${rel}`;
}

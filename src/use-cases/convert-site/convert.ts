/**
 * Site-level converter: orchestrates conversion of every Markdown file in
 * a MkDocs site into Starlight artifacts.
 *
 * Pipeline:
 *   1. Build the run-wide SlugMap from discovered source paths.
 *   2. For each source file: read via FileSystem, run convertFile, collect
 *      diagnostics tagged with the source path.
 *
 * Snippet expansion is separate; callers run `expandSnippets` first (or
 * threaded in via a flag in a follow-up).
 *
 * Returns `Result.ok { files, diagnostics }` or `Result.err` for fatal
 * conditions (slug conflict, unreadable file). Per-file warnings flow
 * through `diagnostics`, not the error channel.
 */

import { ok, err, type Result } from '../../domain/result.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { RepoContext } from '../../domain/config/repo-context.js';
import { buildSlugMap, type SlugMap } from '../../domain/starlight/slug-map.js';
import {
  expectedAstroSlug,
  findSlugIncompatibleSegments,
} from '../../domain/starlight/slug-compat.js';
import { rewriteReadmePaths } from './rename-readme.js';
// renameI18nPath is now consumed inside rewriteReadmePaths.
import { convertFile } from '../convert-file/convert.js';
import { detectFeatures } from '../detect-features/detect.js';
import { expandSnippets } from '../expand-snippets/expand.js';
import type { DetectedFeature } from '../serialize-config/package-json.js';
import { validateFrontmatter } from '../validate-output/frontmatter.js';
import { validateJsxComponents } from '../validate-output/jsx-components.js';
import { validateOutput } from '../validate-output/validate.js';
import { expandIncludeMarkdown } from '../include-markdown/expand.js';
import { scanMacroOccurrences } from '../detect-macros/scan.js';
import { scanMacroExpressions } from '../detect-macros/scan-expressions.js';
import { normalizeTyperSnippetDirectives } from '../normalize/typer-snippet-directives.js';
import { scanHeadingAnchors } from '../normalize/scan-heading-anchors.js';
import { scanGithubAlerts } from '../normalize/scan-github-alerts.js';
import { scanHeadingBadges } from '../normalize/scan-heading-badges.js';
import { scanInlineAdmonitions } from '../normalize/scan-inline-admonitions.js';
import { scanCodeFenceFlags } from '../normalize/scan-code-fence-flags.js';
import { scanPlaceholderPage } from '../normalize/scan-placeholder-pages.js';
import { scanTabAnchors } from '../normalize/scan-tab-anchors.js';
import { scanButtonIcons } from '../normalize/scan-button-icons.js';
import { scanMaterialMarkers } from '../normalize/scan-material-markers.js';
import { scanFrontmatterFields } from '../normalize/scan-frontmatter-fields.js';
import { normalizeMkdocstringsCrossRefs } from '../normalize/mkdocstrings-crossref.js';
import { normalizeLinkAttrLists } from '../normalize/link-attr-list.js';
import { normalizeContentTabs } from '../normalize/content-tabs.js';
import { normalizePackageManagerTabs } from '../normalize/package-manager-tabs.js';
import { detectLandingPage } from '../transform/landing-page.js';
import { promoteSteps } from '../transform/ast/steps.js';
import { normalizeFileTrees } from '../normalize/file-tree.js';

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
   * Material `plugins.blog.blog_dir` (default `blog`) when the blog plugin
   * is enabled. When set, the source's `<blogDir>/index.md` (or .mdx) is
   * skipped — `starlight-blog` auto-generates the blog landing page, and
   * emitting the source's index would either collide or fail the
   * plugin's date-required validation.
   */
  readonly blogDir?: string;
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
   * When true (default), per-file conversion emits Starlight `<Tabs>+<TabItem>`
   * MDX components and promotes affected files to `.mdx`. When false, the
   * legacy `<div class="sl-tabs">` HTML path is used.
   */
  readonly emitMdxTabs?: boolean;
  /**
   * When true (theme.features `content.tabs.link`), the emitted `<Tabs>`
   * components carry a `syncKey` so cross-page tab selection stays in sync.
   * No effect when `emitMdxTabs` is false.
   */
  readonly tabsLinked?: boolean;
  /**
   * Mirrors PyMdown `pymdownx.snippets.dedent_subsections`. When true,
   * extracted line-ranges and named sections have common leading whitespace
   * stripped.
   */
  readonly snippetDedentSubsections?: boolean;
  /**
   * Optional injected validator that re-parses each converted file under
   * the same parser Astro/Starlight uses (MDX or Markdown). When provided,
   * parse errors are surfaced as `output-syntax-error` diagnostics; without
   * it, post-conversion validation is skipped silently. The CLI shell wires
   * the production `@mdx-js/mdx`-backed adapter by default.
   */
  readonly outputValidator?: import('../../domain/ports/output-validator.js').OutputValidator;
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
  // Step 1: rewrite README.md → index.md before slug map / sidebar build.
  // MkDocs treats `README.md` as the section index; Starlight does not.
  // Without this rewrite, `path/README.md` would emit at slug `path/README`
  // and any sidebar entry referencing `path` (the section) would 500.
  // The on-disk path is preserved in `readmeRename.diskByEmit` so the
  // read step finds the original file.
  // Pass i18n locales so the rewrite handles `page.fr.md` → `fr/page.md`
  // before the dot-slugify step (without this, the locale dot gets eaten
  // and the file becomes `page-fr.md`).
  const readmeRename = rewriteReadmePaths(
    input.sourcePaths,
    input.i18nLocales ?? [],
  );
  // When the blog plugin is enabled, drop landing pages that
  // starlight-blog auto-generates. starlight-blog treats every page in the
  // blog directory as a post (requiring `date:` and `authors:`
  // frontmatter); keeping a source `<blogDir>/index.md` (or the
  // `<blogDir>/tags.md` / `<blogDir>/archive.md` index pages many Material
  // sites ship) crashes `astro build` with "Missing date for blog entry
  // '<…>'." starlight-blog renders the equivalents itself.
  const blogIndexPaths = input.blogDir !== undefined
    ? new Set([
        `${input.blogDir}/index.md`,
        `${input.blogDir}/index.mdx`,
        // Material's blog plugin auto-generates a tags landing page; the
        // user's source often has a stub `tags.md` (e.g. `# Tags\n[TAGS]`)
        // that's not a real post.
        `${input.blogDir}/tags.md`,
        `${input.blogDir}/tags.mdx`,
        // Same shape for archive landings.
        `${input.blogDir}/archive.md`,
        `${input.blogDir}/archive.mdx`,
      ])
    : new Set<string>();
  const emitPaths = readmeRename.paths.filter((p) => !blogIndexPaths.has(p));

  // Build the slug map keyed by ORIGINAL disk paths (so the link rewriter
  // can look up `[autre](other.fr.md)` against the path the source author
  // wrote), but with slugs derived from EMIT paths (so the slugs match
  // what Astro actually produces post-rename — `fr/other`, not
  // `other.fr`). The `pathTransform` consults the emitByDisk map computed
  // by `rewriteReadmePaths` so the slug derivation sees the canonical
  // post-rewrite path.
  //
  // Filter out paths that the rewrite dropped (e.g. `X/index.md` losing
  // to a sibling `X.md` in a section-index conflict) — both would derive
  // the same slug and cause a false conflict error.
  const droppedSet = new Set(readmeRename.dropped);
  const sourcePathsForSlug = input.sourcePaths.filter((p) => !droppedSet.has(p));
  const slugResult = buildSlugMap(sourcePathsForSlug, {
    pathTransform: (disk) => readmeRename.emitByDisk.get(disk) ?? null,
  });
  if (!slugResult.ok) {
    return err({ code: 'slug-conflict', message: slugResult.error.message });
  }

  const files: Record<string, string> = {};
  const diagnostics: TaggedDiagnostic[] = [];
  const featureUnion = new Set<DetectedFeature>();

  // Scan emit paths for folder/file basenames that Astro's `github-slugger`
  // will reshape (e.g. `1.0/` → `10/`, `c++-primer.md` → `c-primer`). Each
  // surviving path becomes a sidebar entry whose slug must match Astro's
  // own derivation; when they diverge, the build crashes with
  // `AstroUserError: The slug "<original>" does not exist.` Surface a
  // per-path warning ahead of time so the user can rename or hand-edit.
  for (const emitPath of emitPaths) {
    const incompatible = findSlugIncompatibleSegments(emitPath);
    if (incompatible.length === 0) continue;
    const expected = expectedAstroSlug(emitPath);
    diagnostics.push({
      sourcePath: emitPath,
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'slug-incompatible-path',
        source: 'convert-site/slug-compat',
        message:
          `Source path \`${emitPath}\` contains segment(s) ` +
          `Astro's slug normaliser will reshape: ${incompatible.map((s) => `\`${s}\``).join(', ')}. ` +
          `Astro will register this entry under slug \`${expected}\`, but the converter's emitted ` +
          `sidebar refers to the original path. Either rename the offending segment(s) on disk ` +
          `(e.g. \`1.0/\` → \`1-0/\`, \`c++-primer.md\` → \`cpp-primer.md\`) and re-run the converter, ` +
          `or hand-edit \`astro.config.mjs\` so each affected sidebar entry uses \`${expected}\`.`,
      }),
    });
  }

  // Surface every dropped source path from the rewrite step (slug
  // conflicts where the converter chose a winner). Without this, a user
  // who lost `X/index.md` to a sibling `X.md` would see no signal that
  // one of their files was skipped.
  for (const droppedPath of readmeRename.dropped) {
    diagnostics.push({
      sourcePath: droppedPath,
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'slug-conflict-resolved',
        source: 'convert-site/rewrite-paths',
        message:
          `\`${droppedPath}\` was dropped from the conversion because it ` +
          `produces the same Starlight slug as a sibling file (typically ` +
          `\`X.md\` and \`X/index.md\` both deriving slug \`X\`). The named ` +
          `sibling won — it usually holds the substantive content while the ` +
          `directory's index.md is a thin section-index shim. If this file ` +
          `was the one with real content, rename the conflicting sibling or ` +
          `move this file to a different path.`,
      }),
    });
  }

  for (const sourcePath of emitPaths) {
    // The path on disk may differ from the emit path — README.md was
    // rewritten to index.md above. Look up the disk location from the
    // rewrite map; falls back to the emit path for files that weren't
    // renamed.
    const diskPath = readmeRename.diskByEmit.get(sourcePath) ?? sourcePath;
    const fullPath = joinPath(input.docsDir, diskPath);
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
    // Unconditionally scan for {{ expr }} expressions outside code fences.
    // Runs on the original source so line numbers match the user's file.
    // This covers projects (like pydantic) that use macro syntax without
    // declaring the macros plugin in mkdocs.yml.
    for (const diagnostic of scanMacroExpressions(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Scan for explicit heading IDs ({ #slug }) before they are stripped by
    // normalizeHeadingAttrList. Emits a per-occurrence info diagnostic so
    // users can locate every cross-page deep link that needs manual repair.
    for (const diagnostic of scanHeadingAnchors(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Per-occurrence diagnostic for GitHub-style alert blockquotes
    // (`> [!NOTE]`, `[!TIP]`, etc.). The starlight-github-alerts plugin
    // installed by the package.json scaffolder transforms these at build time;
    // the diagnostic is informational so users can audit their alert usage.
    for (const diagnostic of scanGithubAlerts(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Per-occurrence diagnostic for heading attr_list classes. The
    // normalizer strips the `{ ... }` blob unconditionally; users with
    // Material heading badges learn here that they need the
    // `starlight-heading-badges` plugin to recover the styling.
    const headingBadgeDiagnostics = scanHeadingBadges(read.value);
    for (const diagnostic of headingBadgeDiagnostics) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    if (headingBadgeDiagnostics.length > 0) {
      // At least one ATX heading carried an attr_list class. Auto-install
      // `starlight-heading-badges` so the class is preserved as a Badge
      // next to the heading text — recreating Material's idiom.
      featureUnion.add('heading-badges');
    }
    // Per-occurrence diagnostic for Material's `!!! note inline` / `inline
    // end` admonition modifier. Starlight's `<Aside>` doesn't honor float
    // positioning, so these get rendered as standard block-level asides.
    for (const diagnostic of scanInlineAdmonitions(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Per-occurrence info diagnostic for Material `.copy` / `.no-copy` fence
    // flags. The code-block-meta normalizer strips the attr-list silently;
    // this scanner names each fence so users can audit which blocks relied
    // on the per-block toggle.
    for (const diagnostic of scanCodeFenceFlags(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Single per-file warning for monorepo/multirepo placeholder pages.
    // The converter still scaffolds the page so the site builds and the
    // sidebar structure stays intact; users see exactly which pages need
    // their actual content fetched (or removed).
    const placeholderDiag = scanPlaceholderPage(read.value);
    if (placeholderDiag !== null) {
      diagnostics.push({ sourcePath, diagnostic: placeholderDiag });
    }
    // Single diagnostic per file when content tabs are present, flagging
    // the per-tab anchor-link gap (Material auto-generates `#tab-label`
    // anchors; Starlight's `<TabItem>` has no equivalent).
    for (const diagnostic of scanTabAnchors(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Single diagnostic per file when a Material `.md-button` label carried
    // an icon shortcode that the curated map can't translate to a Starlight
    // built-in. The button still renders correctly with a clean label; only
    // the icon glyph is lost. Lists every unmapped shortcode for traceability.
    for (const diagnostic of scanButtonIcons(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Per-file scanner for Material-specific in-source markers that have
    // no Starlight equivalent: `<!-- material/tags -->` index markers and
    // `comments: true` frontmatter (the latter routes users to
    // `starlight-giscus`).
    for (const diagnostic of scanMaterialMarkers(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Per-file scanner for Material-specific frontmatter fields with no
    // direct Starlight equivalent: search controls (`search.boost`,
    // `search.exclude`) and blog post fields (`categories`, `pin`, `links`).
    for (const diagnostic of scanFrontmatterFields(read.value)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Reduce mkdocstrings [`X`][] and [`X`][module.Path] cross-references to
    // plain inline code `X`. This must run before remark sees the source,
    // because remark-stringify would otherwise escape the brackets to \[ \].
    const crossRefResult = normalizeMkdocstringsCrossRefs(source);
    source = crossRefResult.text;
    for (const diagnostic of crossRefResult.diagnostics) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Strip {.class attr=val} link attribute lists from inline links. Starlight
    // has no equivalent syntax; the brace content would appear as visible text.
    const linkAttrResult = normalizeLinkAttrLists(source);
    source = linkAttrResult.text;
    for (const diagnostic of linkAttrResult.diagnostics) {
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

    // Detect landing-style root index.md and rewrite to Starlight splash template.
    // Runs after all text expansion so the final Markdown content is available.
    const landingResult = detectLandingPage(source, sourcePath);
    if (landingResult.isLanding) {
      source = landingResult.text;
      diagnostics.push({
        sourcePath,
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'landing-page-promoted',
          source: 'convert-site/landing-page',
          message: `Landing-style index.md detected and rewritten to Starlight template: splash with hero: frontmatter block. Review the generated hero.title, hero.tagline, hero.image, and hero.actions fields in the output.`,
        }),
      });
    }

    // Promote ASCII directory tree code fences to <FileTree> MDX component.
    const fileTreeResult = normalizeFileTrees(source);
    if (fileTreeResult.promoted) {
      source = fileTreeResult.text;
      for (const diagnostic of fileTreeResult.diagnostics) {
        diagnostics.push({ sourcePath, diagnostic });
      }
    }

    // Promote tutorial-style ordered lists to <Steps> MDX component.
    const stepsResult = promoteSteps(source);
    if (stepsResult.promoted) {
      source = stepsResult.text;
      for (const diagnostic of stepsResult.diagnostics) {
        diagnostics.push({ sourcePath, diagnostic });
      }
    }

    // Detect package-manager tab groups (npm/yarn/pnpm/bun) and promote them
    // to <PackageManagers pkg="..."> MDX components. This must run after all
    // text-level transformations (snippets, include-markdown, auto-append) but
    // before convertFile so the PM component is visible to MDX detection.
    // We pre-run normalizeContentTabs here so the PM normalizer sees the
    // directive form; convertFile's own normalize() will re-run content-tabs
    // idempotently.
    const pmSource = normalizeContentTabs(source);
    const pmResult = normalizePackageManagerTabs(pmSource, sourcePath);
    for (const diagnostic of pmResult.diagnostics) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    if (pmResult.promoted) {
      featureUnion.add('package-managers');
      source = pmResult.text;
    }

    // Link resolution happens against the ORIGINAL on-disk path so a
    // sibling link like `[autre](other.fr.md)` resolves the same way the
    // source author wrote it. The slug map was built from emit paths, so
    // by the time `[other.fr.md](resolved)` becomes a slug lookup, the
    // i18n + readme + dot-slugify rewrites are all applied uniformly.
    const converted = convertFile({
      source,
      sourcePath: diskPath,
      slugMap: slugResult.value,
      repoContext: input.repoContext ?? null,
      emitMdxTabs: input.emitMdxTabs !== false,
      tabsLinked: input.tabsLinked === true,
    });
    // The rewrite already produced the canonical emit path (READMEs to
    // index, `page.fr.md` to `fr/page.md`, dots slugified). Honour the
    // file's MDX promotion by swapping `.md` → `.mdx` if convertFile
    // detected the file needed JSX components.
    const outputPath =
      converted.extension === 'mdx'
        ? sourcePath.replace(/\.md$/, '.mdx')
        : sourcePath;
    files[outputPath] = converted.text;
    for (const diagnostic of converted.diagnostics) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Emit one info diagnostic per LinkCard promotion in this file.
    const linkCardCount = (converted.text.match(/<LinkCard\b/g) ?? []).length;
    if (linkCardCount > 0) {
      diagnostics.push({
        sourcePath,
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'grid-card-promoted-to-linkcard',
          source: 'convert-site/grids',
          message: `${linkCardCount} navigation grid card${linkCardCount === 1 ? '' : 's'} promoted to <LinkCard> in ${sourcePath}.`,
        }),
      });
    }
    // Emit one info diagnostic per LinkButton promotion in this file.
    const linkButtonCount = (converted.text.match(/<LinkButton\b/g) ?? []).length;
    if (linkButtonCount > 0) {
      diagnostics.push({
        sourcePath,
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'md-button-promoted-to-linkbutton',
          source: 'convert-site/buttons',
          message: `${linkButtonCount} \`.md-button\` link${linkButtonCount === 1 ? '' : 's'} promoted to <LinkButton> in ${sourcePath}.`,
        }),
      });
    }
    for (const diagnostic of validateFrontmatter(converted.text)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    for (const diagnostic of validateJsxComponents(converted.text, sourcePath)) {
      diagnostics.push({ sourcePath, diagnostic });
    }
    // Re-parse the converted file under the same MDX/Markdown parser
    // Astro/Starlight uses at build time. Catches syntax bugs (HTML
    // comments in MDX, unclosed JSX, invalid expressions, etc.) before
    // they reach the user's `astro build`.
    if (input.outputValidator !== undefined) {
      for (const diagnostic of await validateOutput(
        converted.text,
        converted.extension,
        input.outputValidator,
      )) {
        diagnostics.push({ sourcePath: outputPath, diagnostic });
      }
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

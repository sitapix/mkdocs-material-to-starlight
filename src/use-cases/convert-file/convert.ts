/**
 * Per-file converter — the orchestrator that composes every text-level and
 * AST-level transform into a single end-to-end pass.
 *
 * Pipeline:
 *   1. Pre-parse normalize  (text → text)   — admonitions, content tabs
 *   2. Parse with unified   (text → MDAST)  — remark-parse + frontmatter + gfm + directive
 *   3. AST transforms       (MDAST → MDAST) — admonition rename, link rewrite
 *   4. Stringify            (MDAST → text)  — remark-stringify with pinned options
 *
 * Pure given its inputs: takes source text, source path, and slug map; returns
 * converted text plus accumulated diagnostics. Snippet expansion is *not*
 * included here because it requires a `FileSystem` port; callers that want
 * snippet handling run `expandSnippets` before `convertFile`.
 *
 * Idempotency: each composing transform is independently idempotent; the
 * whole orchestrator is therefore idempotent. Verified by test.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import { mdxJsxToMarkdown } from 'mdast-util-mdx-jsx';

/**
 * Register the toMarkdown extension for `mdxJsxFlowElement` /
 * `mdxJsxTextElement` so remark-stringify can serialize the nodes the
 * tabs/grids/cards transforms emit. Serializer-only on purpose — installing
 * the matching MDX parser would change how literal `<div>` etc. in user
 * input are parsed.
 *
 * We include only the `handlers` from `mdxJsxToMarkdown()` and drop its
 * `unsafe` escape rules. The default `unsafe` rules add aggressive `<`
 * escaping (so JSX-ambiguous text gets backslash-escaped on the way out)
 * but that breaks unrelated markdown tokens that contain `<`, most
 * critically the pymdownx.snippets placeholder `--8<--`. The transforms
 * always emit complete mdx elements, so we don't need the global escape
 * to make round-trip stable.
 */
function remarkMdxJsxStringify(this: {
  data: () => { toMarkdownExtensions?: unknown[] };
}): undefined {
  const data = this.data();
  const list = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = []);
  const full = mdxJsxToMarkdown() as { handlers: unknown };
  (list as unknown[]).push({ handlers: full.handlers });
  return undefined;
}

import { normalize, type NormalizeReport } from '../normalize/normalize.js';
import { normalizeMagicLinks } from '../normalize/magiclink.js';
import type { RepoContext } from '../../domain/config/repo-context.js';
import { transformAdmonitionDirectives } from '../transform/ast/admonition-directive.js';
import { transformGridDirectives } from '../transform/ast/grid.js';
import { transformTabDirectives } from '../transform/ast/tabs.js';
import { transformLinkNodes } from '../transform/ast/links.js';
import { transformIcons } from '../transform/ast/icons.js';
import { ensureTitle } from '../transform/ast/ensure-title.js';
import type { Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { SlugMap } from '../../domain/starlight/slug-map.js';
import { detectMdxNeeds } from '../mdx-detection/detect.js';
import { unescapeDirectiveFences } from './unescape-directive-fences.js';
import { injectStarlightImports } from '../mdx-detection/inject-imports.js';
import { escapeJsxExpressionsForMdx } from '../mdx-detection/escape-jsx-expressions.js';
import { sanitizeMdxSyntax, type SanitizeReport } from '../mdx-detection/sanitize-mdx-syntax.js';
import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';

export interface ConvertFileInput {
  readonly source: string;
  readonly sourcePath: string;
  readonly slugMap: SlugMap;
  /**
   * Optional repo context for magiclink autolinking. When null/undefined,
   * `#123` / `@user` / `user/repo#N` shortcuts pass through unchanged.
   */
  readonly repoContext?: RepoContext | null;
  /**
   * When true (default), tab directives compile to Starlight MDX
   * `<Tabs>+<TabItem>` components and the file is promoted to `.mdx`. When
   * false, the legacy plain HTML `<div class="sl-tabs">` path is used.
   */
  readonly emitMdxTabs?: boolean;
  /**
   * When true (set when `theme.features: content.tabs.link` is enabled in
   * mkdocs.yml), the emitted `<Tabs>` components carry a `syncKey` derived
   * from the tab label set so cross-page tab synchronisation works the way
   * Material's linked-tabs feature does. No effect when `emitMdxTabs` is false.
   */
  readonly tabsLinked?: boolean;
}

export interface ConvertFileOutput {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  /**
   * The chosen output extension. `'mdx'` when the converted text references
   * Starlight built-ins, ESM imports, or frontmatter expressions; otherwise
   * `'md'`. Callers use this to compute the output filename.
   */
  readonly extension: 'md' | 'mdx';
}

const STRINGIFY_OPTIONS = {
  bullet: '-' as const,
  emphasis: '_' as const,
  fences: true,
  listItemIndent: 'one' as const,
  strong: '*' as const,
  tightDefinitions: true,
};

export function convertFile(input: ConvertFileInput): ConvertFileOutput {
  const diagnostics: Diagnostic[] = [];
  const repoContext = input.repoContext ?? null;
  // Capture destructive rewrites the normalizers perform (e.g. legacy-syntax
  // stripping `<span id=…>` heading anchors). Without surfacing these, users
  // who relied on the IDs for cross-page links lose those targets silently.
  const normalizeReport: NormalizeReport = {
    legacy: { spanAnchorsStripped: [], bareAttrLines: [] },
    attrList: { bareAttrLines: [], inlineAttrLists: [], spanAnchorsStripped: [] },
  };
  const normalized = normalizeMagicLinks(
    normalize(input.source, normalizeReport),
    repoContext,
  );
  for (const promo of normalizeReport.media ?? []) {
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'media-html5-promoted',
        source: 'normalize/media',
        message:
          '`![type:' +
          promo.kind +
          '](' +
          promo.url +
          ')` promoted to native HTML5 <' +
          promo.kind +
          '> with controls.',
        place: { line: promo.line, column: 1 },
      }),
    );
  }
  for (const item of normalizeReport.legacy.bareAttrLines) {
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'block-attr-list-stripped',
        source: 'normalize/legacy-syntax',
        message: `Bare PyMdown attr_list line \`${item.content}\` was stripped at line ${String(item.line)}. Starlight has no equivalent post-MDX attribute hook; re-attach the desired classes or attributes as JSX props on the preceding element if needed.`,
        place: { line: item.line, column: 1 },
      }),
    );
  }
  for (const item of normalizeReport.legacy.spanAnchorsStripped) {
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'heading-span-anchor-stripped',
        source: 'normalize/legacy-syntax',
        message: `Manual heading anchor \`<span id="${item.anchorId}">\` was stripped at line ${String(item.line)}. Cross-page links targeting \`#${item.anchorId}\` will resolve to nothing — re-add the anchor as \`<a id="${item.anchorId}"></a>\` inside the heading body if those links must keep working, or update the linking pages to use Starlight's auto-generated heading slug.`,
        place: { line: item.line, column: 1 },
      }),
    );
  }
  // PyMdown attr_list strip diagnostics from the universal normalizer pass.
  // These were previously emitted only on the .mdx branch via sanitizeMdxSyntax;
  // moving the strip into normalize() means the report flows through every
  // file (.md and .mdx) and is surfaced at the same point.
  if (normalizeReport.attrList !== undefined) {
    for (const item of normalizeReport.attrList.bareAttrLines) {
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'block-attr-list-stripped',
          source: 'normalize/attr-list',
          message: `Bare PyMdown attr_list line \`${item.content}\` was stripped at line ${String(item.line)}. Starlight has no equivalent post-MDX attribute hook; re-attach the desired classes or attributes as JSX props on the preceding element if needed.`,
          place: { line: item.line, column: 1 },
        }),
      );
    }
    for (const item of normalizeReport.attrList.inlineAttrLists) {
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'inline-attr-list-stripped',
          source: 'normalize/attr-list',
          message: `Inline PyMdown attr_list \`${item.content}\` was stripped at line ${String(item.line)}. Re-attach the desired attributes as JSX props on the preceding element if needed.`,
          place: { line: item.line, column: item.column },
        }),
      );
    }
  }

  const file = unified()
    .use(remarkParse)
    .use(remarkMdxJsxStringify)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(ensureTitle, { sourcePath: input.sourcePath, diagnostics })
    .use(transformAdmonitionDirectives)
    .use(transformGridDirectives)
    .use(transformTabDirectives, {
      emitMdxTabs: input.emitMdxTabs !== false,
      tabsLinked: input.tabsLinked === true,
    })
    .use(transformIcons, { diagnostics })
    .use(transformLinkNodes, {
      fromSourcePath: input.sourcePath,
      slugMap: input.slugMap,
      diagnostics,
    })
    .use(remarkStringify, STRINGIFY_OPTIONS)
    .processSync(normalized);

  const text = unescapeDirectiveFences(String(file));
  const decision = detectMdxNeeds(text);
  if (decision.extension === 'mdx') {
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'mdx-promotion',
        source: 'convert-file/mdx',
        message: `Promoted to .mdx (${decision.reasons.join(', ')}). Used components: ${decision.usedComponents.join(', ') || '(none)'}.`,
      }),
    );
    // MDX treats `{` as expression-opener, so leftover Jinja `{{ var }}`
    // patterns must be wrapped in backticks before MDX parses the file —
    // otherwise the build fails on every unconverted macro expression.
    // Then sanitize the broader set of CommonMark idioms MDX rejects:
    // HTML comments, autolinks, heading-anchor brace blocks, void elements.
    // The collector captures every PyMdown attr_list block we strip so we
    // can surface them to the user — silent strips would hide lost
    // presentation attributes (.class, key=value) the migrator may want
    // to re-attach as JSX props.
    const sanitizeReport: SanitizeReport = {
      bareAttrLines: [],
      inlineAttrLists: [],
      spanAnchorsStripped: [],
    };
    const safeText = sanitizeMdxSyntax(escapeJsxExpressionsForMdx(text), sanitizeReport);
    for (const item of sanitizeReport.bareAttrLines) {
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'block-attr-list-stripped',
          source: 'convert-file/mdx',
          message: `Bare PyMdown attr_list line \`${item.content}\` was stripped at line ${String(item.line)}. Starlight has no equivalent post-MDX attribute hook; re-attach the desired classes or attributes as JSX props on the preceding element if needed.`,
          place: { line: item.line, column: 1 },
        }),
      );
    }
    for (const item of sanitizeReport.inlineAttrLists) {
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'inline-attr-list-stripped',
          source: 'convert-file/mdx',
          message: `Inline PyMdown attr_list \`${item.content}\` was stripped at line ${String(item.line)}. Re-attach the desired attributes as JSX props on the preceding element if needed.`,
          place: { line: item.line, column: item.column },
        }),
      );
    }
    for (const item of sanitizeReport.spanAnchorsStripped) {
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'heading-span-anchor-stripped',
          source: 'convert-file/mdx',
          message: `Manual heading anchor \`<span id="${item.anchorId}">\` was stripped at line ${String(item.line)}. Cross-page links targeting \`#${item.anchorId}\` will resolve to nothing — re-add the anchor as \`<a id="${item.anchorId}"></a>\` inside the heading body if those links must keep working, or update the linking pages to use Starlight's auto-generated heading slug.`,
          place: { line: item.line, column: 1 },
        }),
      );
    }
    const withImports = injectStarlightImports(safeText, decision.usedComponents);
    return { text: withImports, diagnostics, extension: 'mdx' };
  }
  return { text, diagnostics, extension: 'md' };
}

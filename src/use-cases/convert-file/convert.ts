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

import { normalize } from '../normalize/normalize.js';
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
   * When true (set when `theme.features: content.tabs.link` is enabled in
   * mkdocs.yml), tab directives compile to Starlight MDX `<Tabs syncKey>`
   * components instead of plain HTML divs. Forces .mdx output.
   */
  readonly emitMdxTabs?: boolean;
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
  const normalized = normalizeMagicLinks(normalize(input.source), repoContext);

  const file = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkDirective)
    .use(ensureTitle, { sourcePath: input.sourcePath })
    .use(transformAdmonitionDirectives)
    .use(transformGridDirectives)
    .use(transformTabDirectives, { emitMdxTabs: input.emitMdxTabs === true })
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
    const withImports = injectStarlightImports(text, decision.usedComponents);
    return { text: withImports, diagnostics, extension: 'mdx' };
  }
  return { text, diagnostics, extension: 'md' };
}

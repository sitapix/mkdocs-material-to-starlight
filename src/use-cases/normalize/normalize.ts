/**
 * Composed pre-parse pipeline. Runs every text-level normalizer in sequence.
 *
 * The composition is order-independent because each normalizer recognizes a
 * disjoint source-marker set:
 *   - admonitions:   `!!! / ??? / ???+`
 *   - annotations:   `(N) ... { .annotate }` + paired ordered list (downgraded
 *                    to footnote refs/defs; remark-gfm renders them)
 *   - content tabs:  `=== / ===!`
 *   - blocks (new):  `///` (pymdownx.blocks.*)
 *   - buttons:       `[label](url){ .md-button[ ...] }`
 *   - definition lists: `Term \n :   Definition`
 *   - abbreviations: `*[TERM]: Definition` (collected, every later occurrence wrapped)
 *   - critic:        `{++ ++}` `{-- --}` `{== ==}` `{~~ ~> ~~}` `{>> <<}`
 *   - (future)       `--8<--` snippets
 *
 * No normalizer's output contains any of the other normalizers' input markers,
 * so they commute, with one explicit exception: **Critic must run before
 * `inline-marks`** because Critic's `{==text==}` highlight token contains an
 * inner `==text==` pair that would otherwise be consumed by `inline-marks`'
 * `==mark==` matcher. This is the only documented ordering constraint.
 *
 * The returned string is a Markdown document whose only non-CommonMark syntax
 * is `remark-directive` containers. Downstream stages parse it with a unified
 * processor and never need to know that the source was once MkDocs.
 */

import { normalizeAbbreviations } from './abbreviations.js';
import { normalizeCodeBlockMeta } from './code-block-meta.js';
import { normalizeInlineHilite } from './inlinehilite.js';
import { normalizeMaterialShortcodes } from './material-shortcodes.js';
import { normalizeOnlyMkdocs } from './only-mkdocs.js';
import { normalizeFrontmatterHide } from './frontmatter-hide.js';
import { normalizeStandardEmoji } from './emoji.js';
import { normalizeAdmonitions } from './admonitions.js';
import { normalizeAnnotations } from './annotations.js';
import { normalizeBlocks } from './blocks.js';
import { normalizeButtons } from './buttons.js';
import { normalizeCodeAnnotations } from './code-annotations.js';
import { normalizeContentTabs } from './content-tabs.js';
import { normalizeCriticMarkup } from './critic.js';
import { normalizeDefinitionLists } from './deflists.js';
import { normalizeCardGrids } from './grids.js';
import { normalizeFastapiIncludes } from './fastapi-includes.js';
import { normalizeHeadingAttrList } from './heading-attr-list.js';
import { normalizeImages } from './images.js';
import { normalizeInlineMarks } from './inline-marks.js';
import { normalizeLegacySyntax } from './legacy-syntax.js';
import { normalizeMkautodocBlocks } from './mkautodoc.js';
import { normalizeSmartSymbols } from './smartsymbols.js';

export function normalize(source: string): string {
  let current = source;
  current = normalizeCodeAnnotations(current);
  current = normalizeAnnotations(current);
  current = normalizeAbbreviations(current);
  current = normalizeAdmonitions(current);
  current = normalizeBlocks(current);
  current = normalizeButtons(current);
  current = normalizeContentTabs(current);
  current = normalizeCriticMarkup(current);
  current = normalizeDefinitionLists(current);
  current = normalizeCardGrids(current);
  current = normalizeHeadingAttrList(current);
  current = normalizeImages(current);
  current = normalizeInlineMarks(current);
  current = normalizeMkautodocBlocks(current);
  current = normalizeFastapiIncludes(current);
  current = normalizeSmartSymbols(current);
  current = normalizeCodeBlockMeta(current);
  current = normalizeInlineHilite(current);
  current = normalizeMaterialShortcodes(current);
  current = normalizeOnlyMkdocs(current);
  current = normalizeFrontmatterHide(current);
  current = normalizeStandardEmoji(current);
  current = normalizeLegacySyntax(current);
  return current;
}

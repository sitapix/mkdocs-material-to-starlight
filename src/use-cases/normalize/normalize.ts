/**
 * Composed pre-parse pipeline. Runs every text-level normalizer in sequence.
 *
 * Each normalizer owns a disjoint marker set, so order is mostly irrelevant:
 *   - admonitions:      `!!! / ??? / ???+`
 *   - annotations:      `(N) ... { .annotate }` + paired ordered list
 *   - content tabs:     `=== / ===!`
 *   - blocks (new):     `///` (pymdownx.blocks.*)
 *   - buttons:          `[label](url){ .md-button[ ...] }`
 *   - definition lists: `Term \n :   Definition`
 *   - abbreviations:    `*[TERM]: Definition`
 *   - critic:           `{++ ++}` `{-- --}` `{== ==}` `{~~ ~> ~~}` `{>> <<}`
 *
 * One ordering constraint: critic must run before `inline-marks` because
 * `{==text==}` contains an inner `==text==` that `inline-marks` would
 * otherwise consume.
 *
 * Output is a Markdown document whose only non-CommonMark syntax is
 * remark-directive containers; downstream stages do not see MkDocs.
 */

import { normalizeAbbreviations } from './abbreviations.js';
import { normalizeAttrList } from './attr-list.js';
import type { SanitizeReport } from '../mdx-detection/sanitize-mdx-syntax.js';
import { normalizeCodeBlockMeta } from './code-block-meta.js';
import { normalizeInlineHilite } from './inlinehilite.js';
import { normalizeMaterialShortcodes } from './material-shortcodes.js';
import { normalizeOnlyMkdocs } from './only-mkdocs.js';
import { normalizeFrontmatterCommentsStrip } from './frontmatter-comments-strip.js';
import { normalizeFrontmatterHide } from './frontmatter-hide.js';
import { normalizeFrontmatterTemplate } from './frontmatter-template.js';
import { normalizeFrontmatterTitleCoercion } from './frontmatter-title-coerce.js';
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
import { normalizeLegacySyntax, type LegacySyntaxReport } from './legacy-syntax.js';
import { normalizeHtmlBlockSpacing } from './html-block-spacing.js';
import { normalizeMkautodocBlocks } from './mkautodoc.js';
import { normalizeSmartSymbols } from './smartsymbols.js';
import { normalizeFancylists } from './fancylists.js';
import { normalizeWikilinks } from './wikilinks.js';
import { normalizeProgressBar } from './progressbar.js';

/**
 * Optional report channel for `normalize`. When provided, sub-normalizers
 * that destructively rewrite content (e.g. `normalizeLegacySyntax` stripping
 * `<span id=...>` heading anchors) record what they removed so the caller
 * can surface user-facing diagnostics.
 */
export interface NormalizeReport {
  legacy: LegacySyntaxReport;
  attrList?: SanitizeReport;
}

export function normalize(source: string, report?: NormalizeReport): string {
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
  // Long-tail PyMdown extensions. Each is a disjoint marker set:
  //   fancylists: `[a-zA-Z]+\. ` markers at line-start (Roman / alpha)
  //   wikilinks:  `[[…]]` brackets
  //   progress:   `[=N%]` / `[=N/M]` syntax
  // None overlap with each other or with the main normalizers above.
  current = normalizeFancylists(current);
  current = normalizeWikilinks(current);
  current = normalizeProgressBar(current);
  current = normalizeCodeBlockMeta(current);
  current = normalizeInlineHilite(current);
  current = normalizeMaterialShortcodes(current);
  current = normalizeOnlyMkdocs(current);
  // Drop Material's `comments: true|false` toggle BEFORE other frontmatter
  // passes look at it. The flag has no Starlight equivalent and the auto-
  // inferred docsSchema would otherwise reject mixed-type observations
  // (boolean here, string elsewhere) at content-load time.
  current = normalizeFrontmatterCommentsStrip(current);
  current = normalizeFrontmatterHide(current);
  // After `frontmatter-hide` has had its chance to (re)set `template: splash`
  // for hidden-nav pages, strip any remaining non-Starlight `template:`
  // values (`template: project.html`, `template: article_list.html`, etc.).
  // Starlight's frontmatter schema rejects anything other than 'doc' or
  // 'splash', so unhandled Material Jinja templates would crash `astro build`
  // with "template: Invalid option" — see the frontmatter-template module.
  current = normalizeFrontmatterTemplate(current);
  // Re-quote string-typed frontmatter fields whose unquoted value would
  // be coerced by YAML to a non-string (date, number, bool). Without this,
  // a meeting-notes site that uses `title: 2025-10-15` rejects every page
  // at content-load time with "Expected string, received object".
  current = normalizeFrontmatterTitleCoercion(current);
  current = normalizeStandardEmoji(current);
  current = normalizeLegacySyntax(current, report?.legacy);
  // PyMdown `attr_list` strip — runs near the end of the pipeline, AFTER
  // every normalizer that consumes attribute hints (buttons, heading-anchors,
  // emoji shortcodes with `{ .lg }` flags, etc.). What survives at this
  // point is residual `{ scope='col' }`, `{ .sr-only }`, and similar user-
  // prose noise that Astro/Starlight has no extension to render. Without
  // this strip the literal `{ ... }` text leaks into rendered tables and
  // headers — real-world: Ruff `rules.md` table headers display
  // `Code { scope='col' }` to the reader.
  current = normalizeAttrList(current, report?.attrList);
  // Run AFTER all other normalizers so we don't pad tags they emit (e.g.
  // grids.ts emits `<div class="sl-card-grid">` blocks; AST-level transforms
  // assume those are inline). The pad pass only fires when the tag is alone
  // on a line, which is the shape that actually triggers CommonMark's HTML
  // block absorption rule.
  current = normalizeHtmlBlockSpacing(current);
  return current;
}

/**
 * Site-level sidebar compilation. Wraps `parseNavTree` (raw YAML → typed
 * navigation tree), `applySectionIndex` (Material's `nav.section_index`
 * feature), and `compileNavigation` (typed tree → Starlight sidebar
 * config) into a single shell, plus a post-processor that rewrites blog-
 * landing-page sidebar entries to point at the starlight-blog auto route.
 *
 * Pure given its inputs (no I/O). Lives under `use-cases/convert-site/`
 * because the compose-then-rewrite logic is site-level orchestration that
 * should not have to live inline in the API wiring shell.
 */

import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import type { Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { err, ok, type Result } from '../../domain/result.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import { compileNavigation } from '../compile-navigation/compile.js';
import { applySectionIndex } from '../compile-navigation/section-index.js';
import { parseNavTree } from '../config/nav-tree.js';
import { scanNavTopics } from '../detect-features/nav-topics.js';

export interface CompiledSidebar {
  readonly entries: ReadonlyArray<SidebarEntry>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export async function compileSidebarEntries(
  navRaw: ReadonlyArray<unknown> | null,
  preParsed: ReadonlyArray<MkdocsNavEntry> | null,
  slugMap: Parameters<typeof compileNavigation>[1],
  sectionIndexEnabled: boolean,
  options: { blogDir?: string } = {},
): Promise<Result<CompiledSidebar, string>> {
  let tree: ReadonlyArray<MkdocsNavEntry>;
  if (preParsed !== null) {
    tree = preParsed;
  } else if (navRaw === null || navRaw.length === 0) {
    return ok({ entries: [], diagnostics: [] });
  } else {
    const parsed = parseNavTree(navRaw);
    if (!parsed.ok) {
      return err(parsed.error.message);
    }
    tree = parsed.value;
  }
  const transformed = sectionIndexEnabled
    ? applySectionIndex(tree)
    : { nav: tree, diagnostics: [] };
  const sidebar = compileNavigation(transformed.nav, slugMap);
  const topicDiagnostics = scanNavTopics(transformed.nav);
  // When the blog plugin is enabled, the source's `<blogDir>/index.md`
  // is skipped (starlight-blog auto-generates the landing page). Any
  // sidebar entry whose slug is exactly the blog dir would 500 at build
  // time ("slug 'blog' does not exist"). Rewrite those to a link entry
  // pointing at the prefix-routed landing page (`/blog/`).
  const finalEntries =
    options.blogDir !== undefined
      ? rewriteBlogIndexSidebar(sidebar.entries, options.blogDir)
      : sidebar.entries;
  return ok({
    entries: finalEntries,
    diagnostics: [...transformed.diagnostics, ...sidebar.diagnostics, ...topicDiagnostics],
  });
}

/**
 * Replace `{ kind: 'slug', slug: '<blogDir>' }` entries with link entries
 * pointing at the starlight-blog auto-generated landing page. Recurses
 * into group items so the rewrite reaches nested blog references.
 */
function rewriteBlogIndexSidebar(
  entries: ReadonlyArray<SidebarEntry>,
  blogDir: string,
): ReadonlyArray<SidebarEntry> {
  return entries.map((e): SidebarEntry => {
    if (e.kind === 'slug' && e.slug === blogDir) {
      return {
        kind: 'link',
        label: e.label ?? 'Blog',
        href: `/${blogDir}/`,
      };
    }
    if (e.kind === 'group') {
      return { ...e, items: rewriteBlogIndexSidebar(e.items, blogDir) };
    }
    return e;
  });
}

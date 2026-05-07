/**
 * Run the full sidebar pipeline: load `.pages` overrides + literate-nav
 * SUMMARY.md (when configured), compile sidebar entries from
 * `mkdocs.yml`'s `nav:` (or the literate-nav tree), filter the auto-
 * generated blog landing pages so the build doesn't crash on missing
 * slugs, then apply per-directory awesome-pages overrides.
 *
 * Returns the sidebar-entry list ready to feed into `serializeSidebar`,
 * along with the diagnostics emitted by literate-nav and the
 * section-index sidebar compiler.
 */

import { join } from 'node:path';
import type { MkdocsNavEntry, MkdocsPlugin } from '../../domain/config/mkdocs-config.js';
import type { Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { YamlDecoder } from '../../domain/ports/yaml-decoder.js';
import type { Result } from '../../domain/result.js';
import { err, ok } from '../../domain/result.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import type { SlugMap } from '../../domain/starlight/slug-map.js';
import { loadAwesomePagesFiles } from '../config/load-awesome-pages.js';
import { compileSidebarEntries } from '../convert-site/compile-sidebar-entries.js';
import { applyPagesOverrides } from './apply-pages.js';
import { collectCandidateDirectories } from './collect-candidate-directories.js';
import { filterSidebarSlugs } from './filter-sidebar-slugs.js';
import { resolveLiterateNav } from './resolve-literate-nav.js';

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export interface BuildSidebarInput {
  readonly docsDir: string;
  readonly fs: FileSystem;
  readonly yaml: YamlDecoder;
  readonly plugins: ReadonlyArray<MkdocsPlugin>;
  readonly nav: ReadonlyArray<MkdocsNavEntry> | null;
  readonly slugMap: SlugMap;
  readonly sourcePaths: ReadonlyArray<string>;
}

export interface BuildSidebarOutput {
  readonly sidebar: ReadonlyArray<SidebarEntry>;
  readonly sectionIndexDiagnostics: ReadonlyArray<TaggedDiagnostic>;
  readonly literateNavDiagnostics: ReadonlyArray<TaggedDiagnostic>;
}

export interface BuildSidebarError {
  readonly kind: 'config-invalid' | 'nav-compile-failed';
  readonly message: string;
}

export async function buildSidebar(
  input: BuildSidebarInput,
): Promise<Result<BuildSidebarOutput, BuildSidebarError>> {
  const candidateDirectories = collectCandidateDirectories(input.sourcePaths);
  const pagesResult = await loadAwesomePagesFiles({
    docsDir: input.docsDir,
    candidateDirectories,
    fs: input.fs,
    yaml: input.yaml,
  });
  if (!pagesResult.ok) {
    return err({
      kind: 'config-invalid',
      message: `.pages parse failed in "${pagesResult.error.directory}": ${pagesResult.error.message}`,
    });
  }

  const sectionIndexEnabled = input.plugins.some((p) => p.name === 'section-index');
  const literateNav = await resolveLiterateNav(input.plugins, input.docsDir, input.fs);
  const blogDirOption = readBlogDirOption(input.plugins);
  const sidebarResult = await compileSidebarEntries(
    literateNav.tree === null ? input.nav : null,
    literateNav.tree,
    input.slugMap,
    sectionIndexEnabled,
    blogDirOption,
  );
  if (!sidebarResult.ok) {
    return err({ kind: 'nav-compile-failed', message: sidebarResult.error });
  }

  // When the blog plugin is enabled, the converter drops auto-generated
  // landing pages (`<blogDir>/posts/{index,tags,archive}.md`) from emitPaths
  // so starlight-blog can render them itself. Filter them out of the
  // sidebar too — leaving them in would crash `astro build` with
  // "AstroUserError: The slug '<…>' does not exist."
  const droppedBlogSlugs = blogDroppedSlugs(input.plugins);
  const filteredEntries = filterSidebarSlugs(sidebarResult.value.entries, droppedBlogSlugs);
  const sidebar = applyPagesOverrides(filteredEntries, pagesResult.value);

  return ok({
    sidebar,
    sectionIndexDiagnostics: sidebarResult.value.diagnostics.map((d) => ({
      sourcePath: 'mkdocs.yml',
      diagnostic: d,
    })),
    literateNavDiagnostics: literateNav.diagnostics.map((d) => ({
      sourcePath: literateNav.tree === null ? 'mkdocs.yml' : 'SUMMARY.md',
      diagnostic: d,
    })),
  });
}

function readBlogDirOption(plugins: ReadonlyArray<MkdocsPlugin>): { readonly blogDir?: string } {
  const bp = plugins.find((p) => p.name === 'blog');
  if (bp === undefined) return {};
  const dir = typeof bp.options.blog_dir === 'string' ? (bp.options.blog_dir as string) : 'blog';
  return { blogDir: dir };
}

function blogDroppedSlugs(plugins: ReadonlyArray<MkdocsPlugin>): ReadonlySet<string> {
  const bp = plugins.find((p) => p.name === 'blog');
  if (bp === undefined) return new Set<string>();
  const dir = typeof bp.options.blog_dir === 'string' ? (bp.options.blog_dir as string) : 'blog';
  return new Set([`${dir}/posts/index`, `${dir}/posts/tags`, `${dir}/posts/archive`]);
}

// `join` is imported for downstream consumers; the function itself doesn't
// reach into paths beyond what compileSidebarEntries does internally.
void join;

/**
 * Compile a typed `MkdocsNavEntry` tree into a Starlight sidebar configuration.
 *
 * Pure function — takes a nav tree and a slug map, returns the compiled
 * sidebar entries together with any diagnostics collected along the way.
 *
 * Translation rules:
 *   - FileEntry without title  → SlugEntry { slug }                — Starlight infers label from frontmatter
 *   - FileEntry with title     → SlugEntry { slug, label }         — explicit override
 *   - ExternalEntry            → LinkEntry { label, href }
 *   - SectionEntry             → GroupEntry { label, items }       — children compiled recursively
 *
 * Missing references — a FileEntry whose path is absent from the slug map —
 * are reported via a `nav-missing-target` Diagnostic and dropped from the
 * compiled sidebar. They do NOT abort compilation: a single hooks-synthesized
 * page (e.g. mkdocs hooks that generate `changelog.md` at MkDocs build time)
 * must not stop a 2,000-page conversion. Per CLAUDE.md, diagnostics are values,
 * not exceptions.
 */

import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import type { SlugMap } from '../../domain/starlight/slug-map.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface NavCompileResult {
  readonly entries: ReadonlyArray<SidebarEntry>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function compileNavigation(
  nav: ReadonlyArray<MkdocsNavEntry>,
  slugMap: SlugMap,
): NavCompileResult {
  const entries: SidebarEntry[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const entry of nav) {
    const compiled = compileEntry(entry, slugMap);
    if (compiled.entry !== null) {
      entries.push(compiled.entry);
    }
    diagnostics.push(...compiled.diagnostics);
  }
  return { entries, diagnostics };
}

interface EntryResult {
  readonly entry: SidebarEntry | null;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

function compileEntry(entry: MkdocsNavEntry, slugMap: SlugMap): EntryResult {
  if (entry.kind === 'external') {
    return {
      entry: { kind: 'link', label: entry.title, href: entry.href },
      diagnostics: [],
    };
  }
  if (entry.kind === 'file') {
    const record = slugMap.getBySourcePath(entry.path);
    if (record === undefined) {
      return { entry: null, diagnostics: [missingTargetDiagnostic(entry.path)] };
    }
    const slugEntry: SidebarEntry =
      entry.title === null
        ? { kind: 'slug', slug: record.slug }
        : { kind: 'slug', slug: record.slug, label: entry.title };
    return { entry: slugEntry, diagnostics: [] };
  }
  // section
  const compiledChildren = compileNavigation(entry.children, slugMap);
  return {
    entry: {
      kind: 'group',
      label: entry.title,
      items: compiledChildren.entries,
    },
    diagnostics: compiledChildren.diagnostics,
  };
}

function missingTargetDiagnostic(path: string): Diagnostic {
  return createDiagnostic({
    severity: 'warning',
    ruleId: 'nav-missing-target',
    message: `nav references "${path}" but it is not found in the slug map; entry dropped`,
    source: SOURCE,
  });
}

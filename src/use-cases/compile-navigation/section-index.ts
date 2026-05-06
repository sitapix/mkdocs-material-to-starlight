/**
 * Apply mkdocs-section-index semantics to an MkDocs nav tree.
 *
 * In MkDocs Material, the `mkdocs-section-index` plugin causes a section's
 * `index.md` (or `README.md`) child to act as the section's clickable link.
 * Starlight does not have a clickable group label, but it does honor child
 * order — so the closest equivalent is to surface the index page as the
 * first item inside the group. Users can still navigate to it; it is no
 * longer hidden behind the directory's tail.
 *
 * Pure: takes a nav tree, returns a new tree plus per-section diagnostics
 * for every reordering performed. Idempotent: running twice on the same
 * input is a no-op (the index is already at position 0 after the first pass,
 * so the second pass emits no diagnostics).
 *
 * Limitation: the plugin in MkDocs implicitly *includes* an index page that
 * isn't listed in `nav:`. The converter only sees what the user wrote in
 * `nav:`, so an implicit index isn't surfaced. The diagnostic explains this.
 */

import type {
  MkdocsNavEntry,
  SectionEntry,
  FileEntry,
} from '../../domain/config/mkdocs-config.js';
import {
  createDiagnostic,
  type Diagnostic,
} from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'compile-navigation/section-index';
const INDEX_PATH_RE = /\/(index|README)\.md$/i;

export interface ApplySectionIndexResult {
  readonly nav: ReadonlyArray<MkdocsNavEntry>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function applySectionIndex(
  nav: ReadonlyArray<MkdocsNavEntry>,
): ApplySectionIndexResult {
  const diagnostics: Diagnostic[] = [];
  const transformed = nav.map((entry) => transformEntry(entry, diagnostics));
  return { nav: transformed, diagnostics };
}

function transformEntry(
  entry: MkdocsNavEntry,
  diagnostics: Diagnostic[],
): MkdocsNavEntry {
  if (entry.kind !== 'section') {
    return entry;
  }
  const recursedChildren = entry.children.map((child) =>
    transformEntry(child, diagnostics),
  );
  const indexPosition = findIndexChildPosition(recursedChildren);
  if (indexPosition <= 0) {
    return { ...entry, children: recursedChildren };
  }
  const reordered = hoistToFront(recursedChildren, indexPosition);
  diagnostics.push(reorderingDiagnostic(entry, reordered[0] as FileEntry));
  return { ...entry, children: reordered };
}

function findIndexChildPosition(
  children: ReadonlyArray<MkdocsNavEntry>,
): number {
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child !== undefined && child.kind === 'file' && INDEX_PATH_RE.test(child.path)) {
      return i;
    }
  }
  return -1;
}

function hoistToFront<T>(items: ReadonlyArray<T>, position: number): T[] {
  const target = items[position];
  if (target === undefined) return [...items];
  const rest = items.filter((_, i) => i !== position);
  return [target, ...rest];
}

function reorderingDiagnostic(
  section: SectionEntry,
  index: FileEntry,
): Diagnostic {
  return createDiagnostic({
    severity: 'info',
    ruleId: 'plugin-section-index-applied',
    source: SOURCE,
    message:
      `mkdocs-section-index: hoisted "${index.path}" to the top of the "${section.title}" group ` +
      `so the index page stays reachable. UX gap: in Material, the section header itself was a ` +
      `clickable link to this index page (one click). Starlight has no clickable group label, so ` +
      `users must now expand the group AND click the first child (two clicks). If this matters ` +
      `for your site, the workarounds are: (a) keep the page accessible via the in-content links ` +
      `you already have, (b) duplicate the index page as a top-level entry, or (c) author a small ` +
      `Starlight sidebar override component. Run \`/explain plugin-section-index-applied\` for ` +
      `the canonical fix language.`,
  });
}

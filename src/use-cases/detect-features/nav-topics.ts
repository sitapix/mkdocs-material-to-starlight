/**
 * Detect Material's "navigation topics" pattern in `mkdocs.yml`'s `nav:`
 * tree and recommend the `starlight-sidebar-topics` plugin.
 *
 * Material sites that organise content into multiple parallel sections at
 * the top level — e.g. `Guide`, `Reference`, `Tutorials` — render each
 * section as its own sidebar root. Starlight's default sidebar groups them
 * vertically in a single tree, which works but loses the clean separation
 * the author intended. The community plugin `starlight-sidebar-topics`
 * (HiDeoo) renders each top-level section as a switchable "topic" with its
 * own scoped sidebar — the closest equivalent to Material's behaviour.
 *
 * Heuristic: emit a single info diagnostic when there are at least two
 * top-level section entries that each have at least one child. Empty
 * sections and lone sections don't qualify.
 *
 * Pure function: takes the parsed nav tree, returns Diagnostic[]. No I/O.
 * Safe to run on every conversion; idempotent (same input → same output).
 */

import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

export function scanNavTopics(nav: ReadonlyArray<MkdocsNavEntry>): ReadonlyArray<Diagnostic> {
  const sections = nav.filter((entry) => entry.kind === 'section' && entry.children.length > 0);
  if (sections.length < 2) return [];

  const titles = sections.map((entry) => (entry.kind === 'section' ? entry.title : ''));
  return [
    createDiagnostic({
      severity: 'info',
      ruleId: 'nav-multi-topic-detected',
      source: 'detect-features/nav-topics',
      message: `mkdocs.yml \`nav:\` has ${sections.length} top-level sections each with their own subtree (${titles.map((t) => `"${t}"`).join(', ')}). This is Material's "navigation topics" pattern. Starlight renders all sections in a single sidebar tree by default; the \`starlight-sidebar-topics\` community plugin reproduces Material's per-topic switchable sidebars more faithfully. Consider installing it if topic separation is important to your readers.`,
    }),
  ];
}

/**
 * Scanner: detect Material content tabs in source and emit one info
 * diagnostic per file flagging the per-tab anchor-link gap.
 *
 * Material auto-generates an anchor link for each tab (since
 * pymdown-extensions 9.5.0; readable slugs since 9.6.0 with the `slugify`
 * config) so users can deep-link to a specific tab via `#tab-label`.
 * Starlight's `<Tabs>+<TabItem>` has no `id` or anchor prop — the
 * converter cannot preserve the deep-link target. The diagnostic surfaces
 * this loss so users notice broken anchors in MIGRATION_NOTES rather than
 * discovering them later in production.
 *
 * Pure read (no text mutation). Fence-shielded so `=== "Foo"` markers
 * inside fenced code blocks are ignored. One diagnostic per file even when
 * the file contains many tab groups, to keep MIGRATION_NOTES.md focused.
 */

import { parseTabLine } from '../../domain/syntax/tab-line.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { isFenceLine } from '../../domain/syntax/fence.js';

export function scanTabAnchors(source: string): ReadonlyArray<Diagnostic> {
  const lines = source.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (parseTabLine(line) !== null) {
      return [
        createDiagnostic({
          severity: 'info',
          ruleId: 'tab-anchors-not-preserved',
          source: 'normalize/scan-tab-anchors',
          message:
            'Content tabs detected. Material auto-generates an anchor link for each tab (e.g. `#linux`) so external pages can deep-link to a specific tab. Starlight\'s `<TabItem>` has no `id`/anchor prop, so any in-page or cross-page links targeting a tab anchor will resolve to nothing after migration. If you have such links, add a manual `<a id="…">` element inside the affected `<TabItem>` content (the file becomes `.mdx`); note that this only scrolls to the tab — it does not activate hidden tabs without additional client-side script.',
        }),
      ];
    }
  }
  return [];
}

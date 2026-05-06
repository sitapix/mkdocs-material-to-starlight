/**
 * Recursively remove SlugEntry items from a sidebar tree when their
 * slug is in the drop set, then collapse any GroupEntry that becomes
 * empty as a result. Used by the API layer to keep sidebar references in
 * sync with files that the convert pipeline dropped (e.g. starlight-blog
 * auto-generated landing pages).
 *
 * Pure: input + drop set → filtered output. Idempotent (re-running on the
 * already-filtered tree returns the same structure).
 */

import type { SidebarEntry } from '../../domain/starlight/sidebar.js';

export function filterSidebarSlugs(
  entries: ReadonlyArray<SidebarEntry>,
  droppedSlugs: ReadonlySet<string>,
): ReadonlyArray<SidebarEntry> {
  if (droppedSlugs.size === 0) return entries;
  const out: SidebarEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'slug') {
      if (droppedSlugs.has(entry.slug)) continue;
      out.push(entry);
      continue;
    }
    if (entry.kind === 'group') {
      const filteredItems = filterSidebarSlugs(entry.items, droppedSlugs);
      // Drop empty groups so the user doesn't see a stub label with no
      // children in their nav. Astro itself doesn't crash on empty
      // groups, but the visible artifact is more confusing than helpful.
      if (filteredItems.length === 0) continue;
      out.push({ ...entry, items: filteredItems });
      continue;
    }
    out.push(entry);
  }
  return out;
}

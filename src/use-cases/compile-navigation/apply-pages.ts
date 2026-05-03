/**
 * Apply awesome-pages `.pages` overrides to a compiled sidebar tree.
 *
 * Pure: takes the sidebar entries and a map of `directorySlug → .pages config`
 * and returns a new sidebar with:
 *   - group labels overridden when the matching directory's `.pages` has a
 *     `title:`
 *   - groups dropped entirely when `.pages` has `hide: true`
 *   - groups marked `collapsed: true` when `.pages` has `collapse: true`
 *
 * Walks recursively so nested groups receive overrides from their own
 * directory's `.pages` file.
 *
 * The directory key is derived from the FIRST slug entry inside the group: a
 * group whose first slug is `api/auth` belongs to directory `api`. Groups
 * containing only nested groups or external links pass through unchanged.
 */

import type { SidebarEntry, GroupEntry } from '../../domain/starlight/sidebar.js';
import type { AwesomePagesConfig } from '../../domain/config/awesome-pages.js';

export type AwesomePagesMap = ReadonlyMap<string, AwesomePagesConfig>;

export function applyPagesOverrides(
  sidebar: ReadonlyArray<SidebarEntry>,
  pages: AwesomePagesMap,
): ReadonlyArray<SidebarEntry> {
  const out: SidebarEntry[] = [];
  for (const entry of sidebar) {
    const transformed = applyToEntry(entry, pages);
    if (transformed !== null) {
      out.push(transformed);
    }
  }
  return out;
}

function applyToEntry(
  entry: SidebarEntry,
  pages: AwesomePagesMap,
): SidebarEntry | null {
  if (entry.kind !== 'group') {
    return entry;
  }
  const directory = inferGroupDirectory(entry);
  const config = directory === null ? undefined : pages.get(directory);
  if (config?.hide === true) {
    return null;
  }
  const innerItems = applyPagesOverrides(entry.items, pages);
  return buildGroup(entry, innerItems, config);
}

function buildGroup(
  original: GroupEntry,
  items: ReadonlyArray<SidebarEntry>,
  config: AwesomePagesConfig | undefined,
): GroupEntry {
  const label =
    config?.title !== undefined && config.title !== null ? config.title : original.label;
  const result: GroupEntry =
    config?.collapse === true
      ? { kind: 'group', label, items, collapsed: true }
      : original.collapsed === undefined
        ? { kind: 'group', label, items }
        : { kind: 'group', label, items, collapsed: original.collapsed };
  return result;
}

function inferGroupDirectory(group: GroupEntry): string | null {
  for (const item of group.items) {
    if (item.kind === 'slug') {
      const slash = item.slug.lastIndexOf('/');
      return slash === -1 ? '' : item.slug.slice(0, slash);
    }
    if (item.kind === 'group') {
      const inner = inferGroupDirectory(item);
      if (inner !== null) {
        return inner.includes('/') ? parentOf(inner) : inner;
      }
    }
  }
  return null;
}

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

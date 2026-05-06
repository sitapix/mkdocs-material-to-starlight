/**
 * Apply awesome-pages `.pages` overrides to a compiled sidebar tree.
 *
 * Pure: takes the sidebar entries and a `directorySlug → .pages config`
 * map. Overrides:
 *   - `title:` overrides the group label.
 *   - `hide: true` drops the group.
 *   - `collapse: true` marks `collapsed: true`.
 *   - `nav:` reorders items; `...` is the rest placeholder for unlisted
 *     entries; `{ Title: file.md }` renames the visible label.
 *
 * Recurses so nested groups get their own directory's overrides. The
 * directory key comes from the first slug entry inside the group (a group
 * whose first slug is `api/auth` belongs to `api`). Groups holding only
 * nested groups or external links pass through.
 */

import type {
  SidebarEntry,
  GroupEntry,
  SlugEntry,
} from '../../domain/starlight/sidebar.js';
import type {
  AwesomePagesConfig,
  AwesomePagesNavEntry,
} from '../../domain/config/awesome-pages.js';

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
  const ordered =
    config?.nav === undefined || config.nav === null
      ? innerItems
      : applyNavOrdering(innerItems, config.nav);
  return buildGroup(entry, ordered, config);
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

/**
 * Reorder a group's items to match the `.pages` `nav:` sequence.
 *
 * Each `nav:` entry references a child by basename — `intro.md` matches the
 * slug entry whose source file is `<dir>/intro.md`, and `inner` matches the
 * subgroup whose directory key is `<dir>/inner`. Titled entries
 * `{ Title: file.md }` additionally override the visible label of the matched
 * SlugEntry.
 *
 * The `...` rest placeholder marks where any items not explicitly listed
 * land. When `nav:` has no rest placeholder, unlisted items are appended
 * after the listed ones, preserving their original relative order.
 *
 * Items the `nav:` references but the sidebar doesn't contain are skipped
 * silently — awesome-pages itself tolerates missing entries.
 */
function applyNavOrdering(
  items: ReadonlyArray<SidebarEntry>,
  nav: ReadonlyArray<AwesomePagesNavEntry>,
): ReadonlyArray<SidebarEntry> {
  const remaining = new Set<SidebarEntry>(items);
  const placed: ReadonlyArray<SidebarEntry>[] = [];
  let restPosition = -1;

  for (const navEntry of nav) {
    if (navEntry.kind === 'rest') {
      if (restPosition === -1) restPosition = placed.length;
      placed.push([]);
      continue;
    }
    const matched = findMatchingItem(items, navEntry, remaining);
    if (matched === null) continue;
    remaining.delete(matched);
    const renamed =
      navEntry.kind === 'titled' && matched.kind === 'slug'
        ? renameSlug(matched, navEntry.title)
        : matched;
    placed.push([renamed]);
  }

  const leftovers: SidebarEntry[] = [];
  for (const item of items) {
    if (remaining.has(item)) leftovers.push(item);
  }

  if (restPosition === -1) {
    return [...placed.flat(), ...leftovers];
  }
  const out: SidebarEntry[] = [];
  for (let i = 0; i < placed.length; i += 1) {
    if (i === restPosition) out.push(...leftovers);
    out.push(...(placed[i] ?? []));
  }
  return out;
}

function findMatchingItem(
  items: ReadonlyArray<SidebarEntry>,
  nav: { kind: 'literal' | 'titled'; name: string },
  remaining: ReadonlySet<SidebarEntry>,
): SidebarEntry | null {
  const target = nav.name;
  // Strip the `.md` / `.mdx` extension so `intro.md` matches a slug entry
  // whose `.../intro` slug has been derived from `<dir>/intro.md`.
  const targetStem = target.replace(/\.(md|mdx)$/i, '');
  for (const item of items) {
    if (!remaining.has(item)) continue;
    if (item.kind === 'slug') {
      const lastSegment = item.slug.split('/').pop() ?? item.slug;
      if (lastSegment === targetStem) return item;
    } else if (item.kind === 'group') {
      // Subgroup: nav references a directory name. Match against the last
      // segment of any inferred directory key.
      const groupDir = inferGroupDirectory(item);
      if (groupDir !== null) {
        const lastSegment = groupDir.split('/').pop() ?? groupDir;
        if (lastSegment === target) return item;
      }
      if (item.label === target) return item;
    } else if (item.kind === 'link' && item.label === target) {
      return item;
    }
  }
  return null;
}

function renameSlug(entry: SlugEntry, label: string): SlugEntry {
  return { kind: 'slug', slug: entry.slug, label };
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

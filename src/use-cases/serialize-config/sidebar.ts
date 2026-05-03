/**
 * Serialize a `SidebarEntry[]` into a JS-source string suitable for embedding
 * in `astro.config.mjs`. Pure: takes the typed sidebar tree, returns text.
 *
 * The output is normal JavaScript (single-quoted strings, two-space indent),
 * arranged so a Starlight project's `astro.config.mjs` can paste it under the
 * `starlight({ sidebar: ... })` key.
 *
 * Slug entries without a label are emitted as bare string shorthand
 * (`'index'`), matching Starlight's documentation convention. Slug entries
 * with a label use the long-form `{ slug, label }` object.
 */

import type {
  AutoEntry,
  GroupEntry,
  LinkEntry,
  SidebarEntry,
  SlugEntry,
} from '../../domain/starlight/sidebar.js';

const INDENT = '  ';

export function serializeSidebar(entries: ReadonlyArray<SidebarEntry>): string {
  if (entries.length === 0) {
    return '[]';
  }
  return renderArray(entries, 0);
}

function renderArray(
  entries: ReadonlyArray<SidebarEntry>,
  depth: number,
): string {
  const inner = entries.map((e) => `${pad(depth + 1)}${renderEntry(e, depth + 1)},`);
  return `[\n${inner.join('\n')}\n${pad(depth)}]`;
}

function renderEntry(entry: SidebarEntry, depth: number): string {
  switch (entry.kind) {
    case 'slug':
      return renderSlug(entry);
    case 'link':
      return renderLink(entry);
    case 'group':
      return renderGroup(entry, depth);
    case 'auto':
      return renderAuto(entry);
  }
}

function renderSlug(entry: SlugEntry): string {
  // Empty slug = root index page. Starlight's sidebar slug resolver rejects
  // the empty string ("The slug '' does not exist") even though that is the
  // real Astro slug for `src/content/docs/index.md`. Emitting a `{ link: '/' }`
  // form is the documented Starlight pattern for linking to the root from a
  // sidebar entry — it bypasses the slug resolver entirely.
  if (entry.slug === '') {
    if (entry.label === undefined) {
      return `{ link: '/' }`;
    }
    return `{ label: ${quote(entry.label)}, link: '/' }`;
  }
  if (entry.label === undefined) {
    return quote(entry.slug);
  }
  return `{ slug: ${quote(entry.slug)}, label: ${quote(entry.label)} }`;
}

function renderLink(entry: LinkEntry): string {
  return `{ label: ${quote(entry.label)}, link: ${quote(entry.href)} }`;
}

function renderGroup(entry: GroupEntry, depth: number): string {
  const items = renderArray(entry.items, depth);
  const collapsedSuffix = entry.collapsed === true ? ', collapsed: true' : '';
  return `{ label: ${quote(entry.label)}, items: ${items}${collapsedSuffix} }`;
}

function renderAuto(entry: AutoEntry): string {
  const collapsedSuffix = entry.collapsed === true ? ', collapsed: true' : '';
  return `{ label: ${quote(entry.label)}, autogenerate: { directory: ${quote(entry.directory)} }${collapsedSuffix} }`;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function pad(depth: number): string {
  return INDENT.repeat(depth);
}

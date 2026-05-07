import { describe, expect, it } from 'vitest';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import { filterSidebarSlugs } from './filter-sidebar-slugs.js';

describe('filterSidebarSlugs', () => {
  it('returns the input unchanged when the drop set is empty', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      { kind: 'slug', slug: 'a' },
      { kind: 'slug', slug: 'b' },
    ];
    expect(filterSidebarSlugs(entries, new Set())).toBe(entries);
  });

  it('drops top-level SlugEntry items whose slug is in the set', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      { kind: 'slug', slug: 'a' },
      { kind: 'slug', slug: 'blog/tags' },
      { kind: 'slug', slug: 'b' },
    ];
    const out = filterSidebarSlugs(entries, new Set(['blog/tags']));
    expect(out.map((e) => (e.kind === 'slug' ? e.slug : ''))).toEqual(['a', 'b']);
  });

  it('drops nested SlugEntry items inside groups', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      {
        kind: 'group',
        label: 'Blog',
        items: [
          { kind: 'slug', slug: 'blog/index' },
          { kind: 'slug', slug: 'blog/tags' },
          { kind: 'slug', slug: 'blog/posts/hello' },
        ],
      },
    ];
    const out = filterSidebarSlugs(entries, new Set(['blog/index', 'blog/tags']));
    expect(out).toHaveLength(1);
    const group = out[0]!;
    expect(group.kind).toBe('group');
    expect(
      (group as { items: ReadonlyArray<SidebarEntry> }).items.map((e) =>
        e.kind === 'slug' ? e.slug : '',
      ),
    ).toEqual(['blog/posts/hello']);
  });

  it('collapses a group that becomes empty after filtering', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      {
        kind: 'group',
        label: 'Blog',
        items: [
          { kind: 'slug', slug: 'blog/tags' },
          { kind: 'slug', slug: 'blog/index' },
        ],
      },
      { kind: 'slug', slug: 'about' },
    ];
    const out = filterSidebarSlugs(entries, new Set(['blog/tags', 'blog/index']));
    expect(out.map((e) => (e.kind === 'slug' ? e.slug : ''))).toEqual(['about']);
  });

  it('preserves LinkEntry and AutoEntry untouched', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      { kind: 'link', label: 'X', href: 'https://example.com' },
      { kind: 'auto', label: 'Auto', directory: 'guides' },
      { kind: 'slug', slug: 'blog/tags' },
    ];
    const out = filterSidebarSlugs(entries, new Set(['blog/tags']));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ kind: 'link', label: 'X', href: 'https://example.com' });
    expect(out[1]).toEqual({ kind: 'auto', label: 'Auto', directory: 'guides' });
  });

  it('is idempotent', () => {
    const entries: ReadonlyArray<SidebarEntry> = [
      { kind: 'slug', slug: 'a' },
      { kind: 'slug', slug: 'blog/tags' },
    ];
    const drop = new Set(['blog/tags']);
    const once = filterSidebarSlugs(entries, drop);
    expect(filterSidebarSlugs(once, drop)).toEqual(once);
  });
});

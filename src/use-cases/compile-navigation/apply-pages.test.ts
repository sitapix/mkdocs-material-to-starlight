import { describe, expect, it } from 'vitest';
import { applyPagesOverrides } from './apply-pages.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import type { AwesomePagesConfig } from '../../domain/config/awesome-pages.js';

const pages = (overrides: Partial<AwesomePagesConfig> = {}): AwesomePagesConfig => ({
  title: null,
  nav: null,
  collapse: null,
  hide: false,
  ...overrides,
});

describe('applyPagesOverrides', () => {
  it('returns the sidebar unchanged when the map is empty', () => {
    const sidebar: ReadonlyArray<SidebarEntry> = [{ kind: 'slug', slug: 'index' }];
    expect(applyPagesOverrides(sidebar, new Map())).toEqual(sidebar);
  });

  it('overrides a group label using the matching directory .pages title', () => {
    const sidebar: ReadonlyArray<SidebarEntry> = [
      {
        kind: 'group',
        label: 'API',
        items: [{ kind: 'slug', slug: 'api/auth' }],
      },
    ];
    const map = new Map([['api', pages({ title: 'API Reference' })]]);
    const result = applyPagesOverrides(sidebar, map);
    expect(result[0]).toEqual({
      kind: 'group',
      label: 'API Reference',
      items: [{ kind: 'slug', slug: 'api/auth' }],
    });
  });

  it('drops a group entirely when its .pages has hide: true', () => {
    const sidebar: ReadonlyArray<SidebarEntry> = [
      { kind: 'slug', slug: 'index' },
      {
        kind: 'group',
        label: 'Internal',
        items: [{ kind: 'slug', slug: 'internal/notes' }],
      },
    ];
    const map = new Map([['internal', pages({ hide: true })]]);
    const result = applyPagesOverrides(sidebar, map);
    expect(result).toEqual([{ kind: 'slug', slug: 'index' }]);
  });

  it('applies overrides recursively into nested groups', () => {
    const sidebar: ReadonlyArray<SidebarEntry> = [
      {
        kind: 'group',
        label: 'Top',
        items: [
          {
            kind: 'group',
            label: 'Inner',
            items: [{ kind: 'slug', slug: 'top/inner/page' }],
          },
        ],
      },
    ];
    const map = new Map([['top/inner', pages({ title: 'Renamed Inner' })]]);
    const result = applyPagesOverrides(sidebar, map);
    expect(result).toEqual([
      {
        kind: 'group',
        label: 'Top',
        items: [
          {
            kind: 'group',
            label: 'Renamed Inner',
            items: [{ kind: 'slug', slug: 'top/inner/page' }],
          },
        ],
      },
    ]);
  });

  it('applies collapsed: true when .pages has collapse: true', () => {
    const sidebar: ReadonlyArray<SidebarEntry> = [
      {
        kind: 'group',
        label: 'API',
        items: [{ kind: 'slug', slug: 'api/x' }],
      },
    ];
    const map = new Map([['api', pages({ collapse: true })]]);
    const result = applyPagesOverrides(sidebar, map);
    expect(result[0]).toMatchObject({ collapsed: true });
  });

  it('does not crash on link or auto entries', () => {
    const sidebar: ReadonlyArray<SidebarEntry> = [
      { kind: 'link', label: 'NASA', href: 'https://nasa.gov' },
      { kind: 'auto', label: 'Reference', directory: 'reference' },
    ];
    expect(applyPagesOverrides(sidebar, new Map())).toEqual(sidebar);
  });
});

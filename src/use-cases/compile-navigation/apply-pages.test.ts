import { describe, expect, it } from 'vitest';
import type { AwesomePagesConfig } from '../../domain/config/awesome-pages.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import { applyPagesOverrides } from './apply-pages.js';

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

  describe('.pages nav: ordering', () => {
    it('reorders group items to match the nav: literal sequence', () => {
      const sidebar: ReadonlyArray<SidebarEntry> = [
        {
          kind: 'group',
          label: 'API',
          items: [
            { kind: 'slug', slug: 'api/auth' },
            { kind: 'slug', slug: 'api/users' },
            { kind: 'slug', slug: 'api/index' },
          ],
        },
      ];
      const map = new Map([
        [
          'api',
          pages({
            nav: [
              { kind: 'literal', name: 'index.md' },
              { kind: 'literal', name: 'users.md' },
              { kind: 'literal', name: 'auth.md' },
            ],
          }),
        ],
      ]);
      const result = applyPagesOverrides(sidebar, map) as ReadonlyArray<{
        items: ReadonlyArray<{ slug: string }>;
      }>;
      expect(result[0]?.items.map((i) => i.slug)).toEqual(['api/index', 'api/users', 'api/auth']);
    });

    it('places explicitly-listed entries first and appends unlisted entries in their original order (no rest placeholder)', () => {
      const sidebar: ReadonlyArray<SidebarEntry> = [
        {
          kind: 'group',
          label: 'API',
          items: [
            { kind: 'slug', slug: 'api/a' },
            { kind: 'slug', slug: 'api/b' },
            { kind: 'slug', slug: 'api/c' },
          ],
        },
      ];
      const map = new Map([
        [
          'api',
          pages({
            nav: [{ kind: 'literal', name: 'c.md' }],
          }),
        ],
      ]);
      const result = applyPagesOverrides(sidebar, map) as ReadonlyArray<{
        items: ReadonlyArray<{ slug: string }>;
      }>;
      expect(result[0]?.items.map((i) => i.slug)).toEqual(['api/c', 'api/a', 'api/b']);
    });

    it('honours the ... rest placeholder by inserting unlisted entries at that position', () => {
      const sidebar: ReadonlyArray<SidebarEntry> = [
        {
          kind: 'group',
          label: 'Guide',
          items: [
            { kind: 'slug', slug: 'guide/intro' },
            { kind: 'slug', slug: 'guide/tutorial' },
            { kind: 'slug', slug: 'guide/advanced' },
            { kind: 'slug', slug: 'guide/faq' },
          ],
        },
      ];
      const map = new Map([
        [
          'guide',
          pages({
            nav: [
              { kind: 'literal', name: 'intro.md' },
              { kind: 'rest' },
              { kind: 'literal', name: 'faq.md' },
            ],
          }),
        ],
      ]);
      const result = applyPagesOverrides(sidebar, map) as ReadonlyArray<{
        items: ReadonlyArray<{ slug: string }>;
      }>;
      expect(result[0]?.items.map((i) => i.slug)).toEqual([
        'guide/intro',
        'guide/tutorial',
        'guide/advanced',
        'guide/faq',
      ]);
    });

    it('overrides display label using titled entries', () => {
      const sidebar: ReadonlyArray<SidebarEntry> = [
        {
          kind: 'group',
          label: 'API',
          items: [{ kind: 'slug', slug: 'api/auth' }],
        },
      ];
      const map = new Map([
        [
          'api',
          pages({
            nav: [
              {
                kind: 'titled',
                title: 'Authentication',
                name: 'auth.md',
              },
            ],
          }),
        ],
      ]);
      const result = applyPagesOverrides(sidebar, map) as ReadonlyArray<{
        items: ReadonlyArray<{ slug: string; label?: string }>;
      }>;
      expect(result[0]?.items[0]).toEqual({
        kind: 'slug',
        slug: 'api/auth',
        label: 'Authentication',
      });
    });

    it('reorders subgroups when nav: references a directory name', () => {
      const sidebar: ReadonlyArray<SidebarEntry> = [
        {
          kind: 'group',
          label: 'Top',
          items: [
            { kind: 'slug', slug: 'top/page' },
            {
              kind: 'group',
              label: 'Inner',
              items: [{ kind: 'slug', slug: 'top/inner/x' }],
            },
          ],
        },
      ];
      const map = new Map([
        [
          'top',
          pages({
            nav: [
              { kind: 'literal', name: 'inner' },
              { kind: 'literal', name: 'page.md' },
            ],
          }),
        ],
      ]);
      const result = applyPagesOverrides(sidebar, map) as ReadonlyArray<{
        items: ReadonlyArray<{ kind: string; label?: string; slug?: string }>;
      }>;
      const labels = result[0]?.items.map((i) => (i.kind === 'group' ? i.label : i.slug));
      expect(labels).toEqual(['Inner', 'top/page']);
    });

    it('leaves order untouched when nav: is null', () => {
      const sidebar: ReadonlyArray<SidebarEntry> = [
        {
          kind: 'group',
          label: 'API',
          items: [
            { kind: 'slug', slug: 'api/a' },
            { kind: 'slug', slug: 'api/b' },
          ],
        },
      ];
      const map = new Map([['api', pages({ title: 'API Reference' })]]);
      const result = applyPagesOverrides(sidebar, map) as ReadonlyArray<{
        items: ReadonlyArray<{ slug: string }>;
      }>;
      expect(result[0]?.items.map((i) => i.slug)).toEqual(['api/a', 'api/b']);
    });
  });
});

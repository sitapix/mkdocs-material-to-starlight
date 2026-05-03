import { describe, expect, it } from 'vitest';
import { applySectionIndex } from './section-index.js';
import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';

describe('applySectionIndex', () => {
  it('returns the input unchanged when no section contains an index page', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'API',
        children: [
          { kind: 'file', title: null, path: 'api/auth.md' },
          { kind: 'file', title: null, path: 'api/users.md' },
        ],
      },
    ];
    const { nav: result, diagnostics } = applySectionIndex(nav);
    expect(result).toEqual(nav);
    expect(diagnostics).toEqual([]);
  });

  it('hoists an index.md child to position 0 of its section', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'API',
        children: [
          { kind: 'file', title: null, path: 'api/auth.md' },
          { kind: 'file', title: null, path: 'api/index.md' },
          { kind: 'file', title: null, path: 'api/users.md' },
        ],
      },
    ];
    const { nav: result } = applySectionIndex(nav);
    const section = result[0];
    expect(section?.kind).toBe('section');
    if (section?.kind !== 'section') return;
    expect(section.children[0]).toEqual({
      kind: 'file',
      title: null,
      path: 'api/index.md',
    });
    expect(section.children).toHaveLength(3);
  });

  it('also recognizes README.md as an index page', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'Guide',
        children: [
          { kind: 'file', title: null, path: 'guide/intro.md' },
          { kind: 'file', title: null, path: 'guide/README.md' },
        ],
      },
    ];
    const { nav: result } = applySectionIndex(nav);
    const section = result[0];
    if (section?.kind !== 'section') return;
    expect(section.children[0]?.kind === 'file' && section.children[0].path).toBe(
      'guide/README.md',
    );
  });

  it('leaves an already-first index page in place and emits no diagnostic', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'API',
        children: [
          { kind: 'file', title: null, path: 'api/index.md' },
          { kind: 'file', title: null, path: 'api/auth.md' },
        ],
      },
    ];
    const { nav: result, diagnostics } = applySectionIndex(nav);
    expect(result).toEqual(nav);
    expect(diagnostics).toEqual([]);
  });

  it('emits a plugin-section-index-applied diagnostic for each section that was reordered', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'API',
        children: [
          { kind: 'file', title: null, path: 'api/auth.md' },
          { kind: 'file', title: null, path: 'api/index.md' },
        ],
      },
      {
        kind: 'section',
        title: 'Guide',
        children: [
          { kind: 'file', title: null, path: 'guide/intro.md' },
          { kind: 'file', title: null, path: 'guide/README.md' },
        ],
      },
    ];
    const { diagnostics } = applySectionIndex(nav);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((d) => d.ruleId === 'plugin-section-index-applied')).toBe(
      true,
    );
    expect(diagnostics[0]?.message).toMatch(/API/);
    expect(diagnostics[1]?.message).toMatch(/Guide/);
  });

  it('recurses into nested sections', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'API',
        children: [
          {
            kind: 'section',
            title: 'V1',
            children: [
              { kind: 'file', title: null, path: 'api/v1/auth.md' },
              { kind: 'file', title: null, path: 'api/v1/index.md' },
            ],
          },
        ],
      },
    ];
    const { nav: result, diagnostics } = applySectionIndex(nav);
    const outer = result[0];
    if (outer?.kind !== 'section') return;
    const inner = outer.children[0];
    if (inner?.kind !== 'section') return;
    expect(inner.children[0]?.kind === 'file' && inner.children[0].path).toBe(
      'api/v1/index.md',
    );
    expect(diagnostics).toHaveLength(1);
  });

  it('idempotency: applying the transform twice yields the same nav and no second-pass diagnostics', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'API',
        children: [
          { kind: 'file', title: null, path: 'api/auth.md' },
          { kind: 'file', title: null, path: 'api/index.md' },
        ],
      },
    ];
    const first = applySectionIndex(nav);
    const second = applySectionIndex(first.nav);
    expect(second.nav).toEqual(first.nav);
    expect(second.diagnostics).toEqual([]);
  });

  it('handles a mixed top-level nav (file/external/section) without disrupting non-sections', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      { kind: 'file', title: null, path: 'index.md' },
      { kind: 'external', title: 'Web', href: 'https://example.com' },
      {
        kind: 'section',
        title: 'API',
        children: [
          { kind: 'file', title: null, path: 'api/auth.md' },
          { kind: 'file', title: null, path: 'api/index.md' },
        ],
      },
    ];
    const { nav: result } = applySectionIndex(nav);
    expect(result[0]).toEqual({ kind: 'file', title: null, path: 'index.md' });
    expect(result[1]).toEqual({
      kind: 'external',
      title: 'Web',
      href: 'https://example.com',
    });
  });

  it('does not mutate the input nav array', () => {
    const nav: ReadonlyArray<MkdocsNavEntry> = Object.freeze([
      Object.freeze({
        kind: 'section',
        title: 'API',
        children: Object.freeze([
          Object.freeze({ kind: 'file', title: null, path: 'api/auth.md' }),
          Object.freeze({ kind: 'file', title: null, path: 'api/index.md' }),
        ]),
      }),
    ]) as ReadonlyArray<MkdocsNavEntry>;
    expect(() => applySectionIndex(nav)).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { parseNavTree } from './nav-tree.js';
import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';

describe('parseNavTree', () => {
  it('parses a bare filename string as a FileEntry without title', () => {
    const result = parseNavTree(['index.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual<ReadonlyArray<MkdocsNavEntry>>([
        { kind: 'file', title: null, path: 'index.md' },
      ]);
    }
  });

  it('parses a single-key map with a string value as a titled FileEntry', () => {
    const result = parseNavTree([{ Home: 'index.md' }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual<ReadonlyArray<MkdocsNavEntry>>([
        { kind: 'file', title: 'Home', path: 'index.md' },
      ]);
    }
  });

  it('parses an external URL as ExternalEntry', () => {
    const result = parseNavTree([{ NASA: 'https://www.nasa.gov/' }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual<ReadonlyArray<MkdocsNavEntry>>([
        { kind: 'external', title: 'NASA', href: 'https://www.nasa.gov/' },
      ]);
    }
  });

  it('parses a single-key map with a list value as a SectionEntry, recursively', () => {
    const result = parseNavTree([
      {
        Guide: ['guide/intro.md', { Advanced: ['guide/adv-a.md', 'guide/adv-b.md'] }],
      },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual<ReadonlyArray<MkdocsNavEntry>>([
        {
          kind: 'section',
          title: 'Guide',
          children: [
            { kind: 'file', title: null, path: 'guide/intro.md' },
            {
              kind: 'section',
              title: 'Advanced',
              children: [
                { kind: 'file', title: null, path: 'guide/adv-a.md' },
                { kind: 'file', title: null, path: 'guide/adv-b.md' },
              ],
            },
          ],
        },
      ]);
    }
  });

  it('preserves order of siblings', () => {
    const result = parseNavTree(['a.md', 'b.md', 'c.md']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.map((e) => (e.kind === 'file' ? e.path : null))).toEqual([
        'a.md',
        'b.md',
        'c.md',
      ]);
    }
  });

  it('rejects entries that are neither string nor single-key map', () => {
    const result = parseNavTree([42 as unknown as MkdocsNavEntry]);
    expect(result.ok).toBe(false);
  });

  it('rejects map entries with multiple keys', () => {
    const result = parseNavTree([{ A: 'a.md', B: 'b.md' } as unknown as MkdocsNavEntry]);
    expect(result.ok).toBe(false);
  });

  it('treats values starting with http(s):// or mailto: as external links', () => {
    const cases = [
      { Site: 'https://example.com/' },
      { Insecure: 'http://example.com/' },
      { Mail: 'mailto:foo@example.com' },
    ];
    for (const entry of cases) {
      const result = parseNavTree([entry]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[0]?.kind).toBe('external');
      }
    }
  });
});

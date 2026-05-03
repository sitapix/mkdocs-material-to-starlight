import { describe, expect, it } from 'vitest';
import { compileNavigation } from './compile.js';
import { buildSlugMap } from '../../domain/starlight/slug-map.js';
import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import type { SlugMap } from '../../domain/starlight/slug-map.js';

function slugMapOrThrow(paths: ReadonlyArray<string>): SlugMap {
  const result = buildSlugMap(paths);
  if (!result.ok) {
    throw new Error(`fixture: ${result.error.message}`);
  }
  return result.value;
}

describe('compileNavigation', () => {
  it('returns an empty sidebar for an empty nav', () => {
    const map = slugMapOrThrow([]);
    const result = compileNavigation([], map);
    expect(result.entries).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('translates a flat list of FileEntry into SlugEntry items', () => {
    const map = slugMapOrThrow(['index.md', 'api.md']);
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      { kind: 'file', title: null, path: 'index.md' },
      { kind: 'file', title: 'API', path: 'api.md' },
    ];
    const result = compileNavigation(nav, map);
    expect(result.entries).toEqual([
      { kind: 'slug', slug: '' },
      { kind: 'slug', slug: 'api', label: 'API' },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('translates ExternalEntry into LinkEntry', () => {
    const map = slugMapOrThrow([]);
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      { kind: 'external', title: 'NASA', href: 'https://www.nasa.gov/' },
    ];
    const result = compileNavigation(nav, map);
    expect(result.entries).toEqual([
      { kind: 'link', label: 'NASA', href: 'https://www.nasa.gov/' },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('translates SectionEntry into GroupEntry recursively', () => {
    const map = slugMapOrThrow(['guide/intro.md', 'guide/advanced/setup.md']);
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'Guide',
        children: [
          { kind: 'file', title: null, path: 'guide/intro.md' },
          {
            kind: 'section',
            title: 'Advanced',
            children: [
              { kind: 'file', title: null, path: 'guide/advanced/setup.md' },
            ],
          },
        ],
      },
    ];
    const result = compileNavigation(nav, map);
    expect(result.entries).toEqual([
      {
        kind: 'group',
        label: 'Guide',
        items: [
          { kind: 'slug', slug: 'guide/intro' },
          {
            kind: 'group',
            label: 'Advanced',
            items: [{ kind: 'slug', slug: 'guide/advanced/setup' }],
          },
        ],
      },
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it('emits a diagnostic and drops the entry when a FileEntry path is not in the slug map', () => {
    // Real-world regression from pydantic/pydantic: docs/plugins/main.py is a
    // mkdocs hook that synthesizes `changelog.md` at build time. The
    // converter cannot run Python, so the file is missing on disk. Throwing
    // a fatal would abort an otherwise-good 88-page conversion. Per CLAUDE.md
    // "diagnostics over throws", the entry is dropped and reported.
    const map = slugMapOrThrow(['index.md']);
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      { kind: 'file', title: null, path: 'index.md' },
      { kind: 'file', title: 'Changelog', path: 'missing.md' },
    ];
    const result = compileNavigation(nav, map);
    expect(result.entries).toEqual([{ kind: 'slug', slug: '' }]);
    expect(result.diagnostics).toHaveLength(1);
    const diag = result.diagnostics[0];
    expect(diag?.ruleId).toBe('nav-missing-target');
    expect(diag?.severity).toBe('warning');
    expect(diag?.message).toContain('missing.md');
  });

  it('drops a missing FileEntry nested inside a SectionEntry while keeping its siblings', () => {
    const map = slugMapOrThrow(['guide/intro.md']);
    const nav: ReadonlyArray<MkdocsNavEntry> = [
      {
        kind: 'section',
        title: 'Guide',
        children: [
          { kind: 'file', title: null, path: 'guide/intro.md' },
          { kind: 'file', title: 'Missing', path: 'guide/missing.md' },
        ],
      },
    ];
    const result = compileNavigation(nav, map);
    expect(result.entries).toEqual([
      {
        kind: 'group',
        label: 'Guide',
        items: [{ kind: 'slug', slug: 'guide/intro' }],
      },
    ]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.message).toContain('guide/missing.md');
  });
});

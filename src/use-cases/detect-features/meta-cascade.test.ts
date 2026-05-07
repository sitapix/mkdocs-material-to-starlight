import { describe, expect, it } from 'vitest';
import type { YamlDecoder } from '../../domain/ports/yaml-decoder.js';
import { err, ok } from '../../domain/result.js';
import {
  effectiveMetaDefaults,
  type MetaEntry,
  mergeFrontmatter,
  parseMetaFiles,
} from './meta-cascade.js';

const yaml: YamlDecoder = {
  decode: (source) => {
    if (source.trim() === 'BAD') return err({ message: 'bad yaml' });
    if (source.trim() === 'NOT_OBJECT') return ok('hello');
    const out: Record<string, unknown> = {};
    for (const line of source.split('\n')) {
      const m = /^(\w+):\s*(.+)$/.exec(line);
      if (m === null) continue;
      const [, k, raw] = m;
      if (k === undefined || raw === undefined) continue;
      out[k] = raw === 'true' ? true : raw === 'false' ? false : raw;
    }
    return ok(out);
  },
};

describe('parseMetaFiles', () => {
  it('parses every well-formed meta.yml entry', () => {
    const out = parseMetaFiles(
      [
        ['.meta.yml', 'template: splash'],
        ['api/.meta.yml', 'authors: alice'],
      ],
      yaml,
    );
    expect(out).toEqual([
      { relPath: '.meta.yml', defaults: { template: 'splash' } },
      { relPath: 'api/.meta.yml', defaults: { authors: 'alice' } },
    ]);
  });

  it('skips files whose YAML fails to decode', () => {
    const out = parseMetaFiles(
      [
        ['.meta.yml', 'BAD'],
        ['api/.meta.yml', 'authors: alice'],
      ],
      yaml,
    );
    expect(out).toEqual([{ relPath: 'api/.meta.yml', defaults: { authors: 'alice' } }]);
  });

  it('skips files whose YAML root is not an object', () => {
    const out = parseMetaFiles([['.meta.yml', 'NOT_OBJECT']], yaml);
    expect(out).toEqual([]);
  });
});

describe('effectiveMetaDefaults', () => {
  function entries(...rows: Array<[string, Record<string, unknown>]>): ReadonlyArray<MetaEntry> {
    return rows.map(([relPath, defaults]) => ({ relPath, defaults }));
  }

  it('returns empty map when no entries apply', () => {
    const out = effectiveMetaDefaults('foo.md', []);
    expect(out).toEqual({});
  });

  it('applies a root-level meta.yml to a top-level page', () => {
    const e = entries(['.meta.yml', { template: 'splash' }]);
    expect(effectiveMetaDefaults('index.md', e)).toEqual({ template: 'splash' });
  });

  it('applies a root-level meta.yml to a deeply-nested page', () => {
    const e = entries(['.meta.yml', { template: 'splash' }]);
    expect(effectiveMetaDefaults('api/v2/auth.md', e)).toEqual({ template: 'splash' });
  });

  it('overlays deeper meta.yml on top of root (deeper wins per key)', () => {
    const e = entries(
      ['.meta.yml', { template: 'splash', authors: 'team' }],
      ['api/.meta.yml', { authors: 'alice' }],
    );
    expect(effectiveMetaDefaults('api/auth.md', e)).toEqual({
      template: 'splash',
      authors: 'alice',
    });
  });

  it('only applies entries on the page ancestor chain', () => {
    const e = entries(
      ['guides/.meta.yml', { template: 'guide' }],
      ['api/.meta.yml', { template: 'api' }],
    );
    expect(effectiveMetaDefaults('api/auth.md', e)).toEqual({ template: 'api' });
    expect(effectiveMetaDefaults('guides/intro.md', e)).toEqual({ template: 'guide' });
    expect(effectiveMetaDefaults('top.md', e)).toEqual({});
  });

  it('cascades through three levels — root then mid then leaf', () => {
    const e = entries(
      ['.meta.yml', { a: 'root', b: 'root' }],
      ['x/.meta.yml', { b: 'mid', c: 'mid' }],
      ['x/y/.meta.yml', { c: 'leaf' }],
    );
    expect(effectiveMetaDefaults('x/y/page.md', e)).toEqual({
      a: 'root',
      b: 'mid',
      c: 'leaf',
    });
  });
});

describe('mergeFrontmatter', () => {
  it('lets page frontmatter override cascaded defaults key-by-key', () => {
    const out = mergeFrontmatter(
      { title: 'Page Title', authors: 'me' },
      { template: 'splash', authors: 'team' },
    );
    expect(out).toEqual({
      template: 'splash',
      title: 'Page Title',
      authors: 'me',
    });
  });

  it('returns defaults when page has no frontmatter', () => {
    const out = mergeFrontmatter({}, { template: 'splash' });
    expect(out).toEqual({ template: 'splash' });
  });

  it('returns page values when no defaults apply', () => {
    const out = mergeFrontmatter({ title: 'X' }, {});
    expect(out).toEqual({ title: 'X' });
  });

  it('is idempotent — merging the same defaults twice gives the same output', () => {
    const defaults = { template: 'splash', tags: 'a' };
    const page = { title: 'Page' };
    const once = mergeFrontmatter(page, defaults);
    const twice = mergeFrontmatter(once, defaults);
    expect(twice).toEqual(once);
  });

  it('does shallow merge — page array values fully replace cascaded ones', () => {
    const out = mergeFrontmatter({ authors: ['alice'] }, { authors: ['team-a', 'team-b'] });
    expect(out.authors).toEqual(['alice']);
  });

  it('does shallow merge — page object values fully replace cascaded ones', () => {
    const out = mergeFrontmatter(
      { hero: { title: 'P' } },
      { hero: { title: 'D', tagline: 'tag' } },
    );
    // Whole `hero` object is replaced — key-level overlay, not deep merge.
    expect(out.hero).toEqual({ title: 'P' });
  });
});

describe('effectiveMetaDefaults — additional edge cases', () => {
  it('handles a four-level cascade with overlapping keys', () => {
    const e: ReadonlyArray<MetaEntry> = [
      { relPath: '.meta.yml', defaults: { a: 'r', b: 'r', c: 'r', d: 'r' } },
      { relPath: 'a/.meta.yml', defaults: { b: 'a', c: 'a', d: 'a' } },
      { relPath: 'a/b/.meta.yml', defaults: { c: 'ab', d: 'ab' } },
      { relPath: 'a/b/c/.meta.yml', defaults: { d: 'abc' } },
    ];
    expect(effectiveMetaDefaults('a/b/c/page.md', e)).toEqual({
      a: 'r',
      b: 'a',
      c: 'ab',
      d: 'abc',
    });
  });

  it('preserves array values from the deepest matching meta.yml', () => {
    const e: ReadonlyArray<MetaEntry> = [
      { relPath: '.meta.yml', defaults: { authors: ['root'] } },
      { relPath: 'api/.meta.yml', defaults: { authors: ['api-team'] } },
    ];
    expect(effectiveMetaDefaults('api/auth.md', e)).toEqual({
      authors: ['api-team'],
    });
  });

  it('preserves nested object values (no deep merge)', () => {
    const e: ReadonlyArray<MetaEntry> = [
      { relPath: '.meta.yml', defaults: { hero: { tagline: 'root' } } },
      { relPath: 'api/.meta.yml', defaults: { hero: { title: 'API' } } },
    ];
    // `hero` from `api/` wins entirely — `tagline` is gone.
    expect(effectiveMetaDefaults('api/index.md', e)).toEqual({
      hero: { title: 'API' },
    });
  });

  it('a meta.yml in the same directory as the page applies', () => {
    const e: ReadonlyArray<MetaEntry> = [
      { relPath: 'guides/.meta.yml', defaults: { template: 'guide' } },
    ];
    expect(effectiveMetaDefaults('guides/intro.md', e)).toEqual({
      template: 'guide',
    });
  });

  it('directory-name dots and dashes do not break ancestor matching', () => {
    const e: ReadonlyArray<MetaEntry> = [
      { relPath: 'v1.0/.meta.yml', defaults: { version: '1.0' } },
      { relPath: 'v1.0/api-v2/.meta.yml', defaults: { section: 'api-v2' } },
    ];
    expect(effectiveMetaDefaults('v1.0/api-v2/auth.md', e)).toEqual({
      version: '1.0',
      section: 'api-v2',
    });
  });

  it('meta.yml at a sibling directory does NOT apply', () => {
    const e: ReadonlyArray<MetaEntry> = [{ relPath: 'a/b/.meta.yml', defaults: { x: 1 } }];
    expect(effectiveMetaDefaults('a/c/page.md', e)).toEqual({});
  });

  it('returns a fresh object — caller mutation does not affect the entry source', () => {
    const e: ReadonlyArray<MetaEntry> = [
      { relPath: '.meta.yml', defaults: { template: 'splash' } },
    ];
    const r1 = effectiveMetaDefaults('p.md', e);
    (r1 as Record<string, unknown>).template = 'mutated';
    const r2 = effectiveMetaDefaults('p.md', e);
    expect(r2.template).toBe('splash');
  });
});

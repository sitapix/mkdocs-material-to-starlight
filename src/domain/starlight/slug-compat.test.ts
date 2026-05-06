import { describe, expect, it } from 'vitest';
import {
  expectedAstroSlug,
  findSlugIncompatibleSegments,
} from './slug-compat.js';

describe('findSlugIncompatibleSegments', () => {
  it('returns an empty array for ASCII slug-safe paths', () => {
    expect(findSlugIncompatibleSegments('cs/sys/intro.md')).toEqual([]);
    expect(findSlugIncompatibleSegments('getting-started.md')).toEqual([]);
    expect(findSlugIncompatibleSegments('api/auth-tokens.md')).toEqual([]);
  });

  it('flags folder names containing `.` (Mike-versioned folders)', () => {
    // Real-world: karavel-io/platform-component-external-secrets has
    // `docs/1.0/configuration.md` and `docs/1.1/configuration.md`.
    // Astro's `github-slugger` strips the dot, so the actual slug
    // becomes `10/configuration` — sidebar refs to `1.0/configuration`
    // 404 at build.
    expect(findSlugIncompatibleSegments('1.0/configuration.md'))
      .toEqual(['1.0']);
    expect(findSlugIncompatibleSegments('docs/v1.2/page.md'))
      .toEqual(['v1.2']);
  });

  it('flags filenames containing `+`', () => {
    // Real-world: jujimeizuo/note has `cs/sys/cmu-15-445/c++-primer.md`.
    // github-slugger drops the `+` chars and collapses dashes — the
    // actual slug is `c-primer`, not `c++-primer`.
    expect(findSlugIncompatibleSegments('cs/sys/cmu-15-445/c++-primer.md'))
      .toEqual(['c++-primer']);
  });

  it('flags multiple incompatible segments in a single path', () => {
    expect(findSlugIncompatibleSegments('docs/1.0/c++-primer.md'))
      .toEqual(['1.0', 'c++-primer']);
  });

  it('flags spaces, ampersands, parentheses, and other punctuation', () => {
    expect(findSlugIncompatibleSegments('Q&A/page.md')).toEqual(['Q&A']);
    expect(findSlugIncompatibleSegments('foo (draft).md')).toEqual(['foo (draft)']);
    expect(findSlugIncompatibleSegments('hello world.md')).toEqual(['hello world']);
  });

  it('does NOT flag uppercase or hyphen-only segments (those just lowercase)', () => {
    // Uppercase is benign — github-slugger lowercases but the resulting
    // slug is unambiguous and our internal slug derivation already
    // lowercases. No build break.
    expect(findSlugIncompatibleSegments('API/Reference.md')).toEqual([]);
    expect(findSlugIncompatibleSegments('API_Reference.md')).toEqual([]);
  });

  it('does NOT flag CJK / Unicode-letter folder names', () => {
    // github-slugger preserves Unicode letters, so Chinese-named folders
    // round-trip cleanly.
    expect(findSlugIncompatibleSegments('笔记/intro.md')).toEqual([]);
  });

  it('handles index.md and README.md cleanly', () => {
    expect(findSlugIncompatibleSegments('index.md')).toEqual([]);
    expect(findSlugIncompatibleSegments('README.md')).toEqual([]);
  });
});

describe('expectedAstroSlug', () => {
  it('matches `github-slugger`-style normalization per segment', () => {
    expect(expectedAstroSlug('1.0/configuration.md')).toBe('10/configuration');
    expect(expectedAstroSlug('cs/sys/cmu-15-445/c++-primer.md'))
      .toBe('cs/sys/cmu-15-445/c-primer');
    expect(expectedAstroSlug('Q&A/page.md')).toBe('qa/page');
    expect(expectedAstroSlug('foo (draft).md')).toBe('foo-draft');
  });

  it('strips `index` and `README` suffix and lowercases consistently', () => {
    expect(expectedAstroSlug('api/index.md')).toBe('api');
    expect(expectedAstroSlug('api/README.md')).toBe('api');
    expect(expectedAstroSlug('index.md')).toBe('');
  });
});

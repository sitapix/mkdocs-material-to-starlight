import { describe, expect, it } from 'vitest';
import { deriveSlug } from './slug.js';

describe('deriveSlug', () => {
  it('maps index.md to the empty slug', () => {
    expect(deriveSlug('index.md')).toBe('');
  });

  it('maps a top-level page to its filename stem', () => {
    expect(deriveSlug('getting-started.md')).toBe('getting-started');
  });

  it('preserves nested directories with forward slashes', () => {
    expect(deriveSlug('api/auth.md')).toBe('api/auth');
    expect(deriveSlug('guides/intro/setup.md')).toBe('guides/intro/setup');
  });

  it('maps directory/index.md to just the directory slug', () => {
    expect(deriveSlug('api/index.md')).toBe('api');
    expect(deriveSlug('guides/intro/index.md')).toBe('guides/intro');
  });

  it('handles backslash-separated Windows-style paths', () => {
    expect(deriveSlug('api\\auth.md')).toBe('api/auth');
  });

  it('strips a leading ./ if present', () => {
    expect(deriveSlug('./api/auth.md')).toBe('api/auth');
  });

  it('rejects empty input', () => {
    expect(() => deriveSlug('')).toThrow(/empty/i);
  });

  it('rejects paths with no .md extension', () => {
    expect(() => deriveSlug('api/auth.html')).toThrow(/\.md/);
    expect(() => deriveSlug('readme')).toThrow(/\.md/);
  });

  it('also accepts .mdx files', () => {
    expect(deriveSlug('api/auth.mdx')).toBe('api/auth');
    expect(deriveSlug('index.mdx')).toBe('');
  });

  it('treats a top-level README.md the same as index.md (empty slug)', () => {
    expect(deriveSlug('README.md')).toBe('');
    expect(deriveSlug('README.mdx')).toBe('');
  });

  it('treats directory/README.md the same as directory/index.md', () => {
    expect(deriveSlug('api/README.md')).toBe('api');
    expect(deriveSlug('guides/intro/README.md')).toBe('guides/intro');
    expect(deriveSlug('api/README.mdx')).toBe('api');
  });

  it('README matching is case-sensitive on the basename — "Readme.md" is a regular page (slug then lowercased)', () => {
    // Both MkDocs section-index plugin and most repos treat README.md as
    // the canonical spelling. Mixed-case spellings are intentional file
    // names, not folder indexes — they survive the index-stripping step
    // but the final slug is then lowercased to match Astro's default
    // content-collection slug derivation.
    expect(deriveSlug('api/Readme.md')).toBe('api/readme');
    expect(deriveSlug('api/readme.md')).toBe('api/readme');
  });
});

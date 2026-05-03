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
});

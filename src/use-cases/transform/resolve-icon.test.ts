import { describe, expect, it } from 'vitest';
import { resolveIcon } from './resolve-icon.js';

describe('resolveIcon', () => {
  it('returns null for non-icon strings', () => {
    expect(resolveIcon({ shortcode: 'plain text' })).toBeNull();
    expect(resolveIcon({ shortcode: '' })).toBeNull();
    expect(resolveIcon({ shortcode: ':notvalid' })).toBeNull();
    expect(resolveIcon({ shortcode: 'no-colon-prefix:' })).toBeNull();
  });

  it('resolves a known Material shortcode through the user override map first', () => {
    const result = resolveIcon({
      shortcode: ':material-cog:',
      overrides: { 'material-cog': 'setting' },
    });
    expect(result).toEqual({
      kind: 'starlight-builtin',
      name: 'setting',
      original: 'material-cog',
    });
  });

  it('resolves a known Material shortcode through the curated mapping', () => {
    const result = resolveIcon({ shortcode: ':material-rocket:' });
    expect(result).toEqual({
      kind: 'starlight-builtin',
      name: 'rocket',
      original: 'material-rocket',
    });
  });

  it('falls back to local-svg for an unmapped Material icon', () => {
    const result = resolveIcon({ shortcode: ':material-totally-made-up:' });
    expect(result).toEqual({
      kind: 'local-svg',
      iconSet: 'material',
      iconName: 'totally-made-up',
      original: 'material-totally-made-up',
    });
  });

  it('handles fontawesome-style shortcodes', () => {
    const result = resolveIcon({ shortcode: ':fontawesome-brands-github:' });
    expect(result?.kind).toBe('starlight-builtin');
    if (result?.kind === 'starlight-builtin') {
      expect(result.name).toBe('github');
    }
  });

  it('handles octicons-size shortcodes', () => {
    const result = resolveIcon({ shortcode: ':octicons-repo-push-16:' });
    expect(result?.kind).toBe('local-svg');
    if (result?.kind === 'local-svg') {
      expect(result.iconSet).toBe('octicons');
      expect(result.iconName).toBe('repo-push-16');
    }
  });

  it('returns a placeholder for an unknown icon-set prefix', () => {
    const result = resolveIcon({ shortcode: ':totally-unknown-prefix:' });
    expect(result).toEqual({
      kind: 'placeholder',
      original: 'totally-unknown-prefix',
    });
  });

  it('returns null for bare identifier shortcodes that are not icon-shaped', () => {
    // Bare `:identifier:` (no hyphen) is not an icon attempt — it is most
    // likely a token from a different markdown extension (mkautodoc's
    // `:docstring:` / `:members:`, an emoji like `:smile:`, or a custom
    // plugin's directive). Returning a placeholder here would emit a
    // false-positive icon-unmapped diagnostic for every such token, and
    // would let downstream stringification escape the colons.
    expect(resolveIcon({ shortcode: ':docstring:' })).toBeNull();
    expect(resolveIcon({ shortcode: ':members:' })).toBeNull();
    expect(resolveIcon({ shortcode: ':smile:' })).toBeNull();
    expect(resolveIcon({ shortcode: ':warning:' })).toBeNull();
  });
});

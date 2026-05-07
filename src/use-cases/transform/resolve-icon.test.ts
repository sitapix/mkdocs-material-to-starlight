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

  it('maps paper-plane variants (Material docs canonical button-icon example) to forward-slash', () => {
    // Material's "Adding icon buttons" reference uses
    // `:fontawesome-solid-paper-plane:`. Starlight has no `paper-plane` icon,
    // but `forward-slash` is its paper-airplane glyph (already used for the
    // octicons-paper-airplane mapping).
    expect(resolveIcon({ shortcode: ':fontawesome-solid-paper-plane:' })).toEqual({
      kind: 'starlight-builtin',
      name: 'forward-slash',
      original: 'fontawesome-solid-paper-plane',
    });
    expect(resolveIcon({ shortcode: ':fontawesome-regular-paper-plane:' })).toEqual({
      kind: 'starlight-builtin',
      name: 'forward-slash',
      original: 'fontawesome-regular-paper-plane',
    });
    expect(resolveIcon({ shortcode: ':material-send:' })).toEqual({
      kind: 'starlight-builtin',
      name: 'forward-slash',
      original: 'material-send',
    });
    expect(resolveIcon({ shortcode: ':material-paper-airplane:' })).toEqual({
      kind: 'starlight-builtin',
      name: 'forward-slash',
      original: 'material-paper-airplane',
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

  it('uses Starlight built-in icons added in 0.36+ for shortcodes that previously fell back to seti file-icons or generic proxies', () => {
    // Pinned upgrades: each of these used to map to a poor proxy
    // (seti:clock for time, seti:db for database, seti:terraform for
    // server, `random` for lock, `comment-alt` for question, `preview`
    // for monitor/cellphone, `forward-slash` for git-branch). Starlight
    // 0.36+ adds dedicated icons; switching to them removes the most
    // visually misleading mappings in the curated table.
    const cases: ReadonlyArray<readonly [string, string]> = [
      [':material-clock:', 'clock'],
      [':fontawesome-solid-clock:', 'clock'],
      [':octicons-clock:', 'clock'],
      [':material-monitor:', 'desktop'],
      [':material-laptop:', 'desktop'],
      [':material-cellphone:', 'mobile-android'],
      [':material-database:', 'database'],
      [':octicons-database:', 'database'],
      [':material-server:', 'server'],
      [':octicons-server:', 'server'],
      [':octicons-git-branch:', 'code-branch'],
      [':material-help:', 'question'],
      [':material-help-circle:', 'question-circle'],
      [':fontawesome-solid-question-circle:', 'question-circle'],
      [':fontawesome-solid-circle-question:', 'question-circle'],
      [':material-lock:', 'padlock'],
      [':fontawesome-solid-lock:', 'padlock'],
      [':octicons-lock:', 'padlock'],
      [':simple-solidjs:', 'solidjs'],
    ];
    for (const [shortcode, expected] of cases) {
      const result = resolveIcon({ shortcode });
      expect(result?.kind, `for ${shortcode}`).toBe('starlight-builtin');
      if (result?.kind === 'starlight-builtin') {
        expect(result.name, `for ${shortcode}`).toBe(expected);
      }
    }
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

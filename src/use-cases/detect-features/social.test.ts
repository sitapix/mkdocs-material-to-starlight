import { describe, expect, it } from 'vitest';
import { extractSocial } from './social.js';

describe('extractSocial', () => {
  it('returns empty array when extras has no social key', () => {
    expect(extractSocial({})).toEqual([]);
  });

  it('returns empty array when social is not an array', () => {
    expect(extractSocial({ social: 'invalid' })).toEqual([]);
  });

  it('maps a single fontawesome github icon to Starlight icon name', () => {
    const result = extractSocial({
      social: [{ icon: 'fontawesome/brands/github', link: 'https://github.com/x' }],
    });
    expect(result).toEqual([
      { icon: 'github', label: 'github', href: 'https://github.com/x' },
    ]);
  });

  it('uses Material `name` as label when present', () => {
    const result = extractSocial({
      social: [
        { icon: 'fontawesome/brands/github', link: 'https://github.com/x', name: 'Source code' },
      ],
    });
    expect(result[0]?.label).toBe('Source code');
  });

  it('maps multiple icons across the common vocabulary', () => {
    const result = extractSocial({
      social: [
        { icon: 'fontawesome/brands/github', link: 'https://github.com/x' },
        { icon: 'fontawesome/brands/twitter', link: 'https://twitter.com/x' },
        { icon: 'fontawesome/brands/x-twitter', link: 'https://x.com/x' },
        { icon: 'fontawesome/brands/discord', link: 'https://discord.gg/x' },
        { icon: 'fontawesome/brands/mastodon', link: 'https://example.social/@x' },
        { icon: 'fontawesome/brands/linkedin', link: 'https://linkedin.com/in/x' },
        { icon: 'fontawesome/brands/youtube', link: 'https://youtube.com/@x' },
      ],
    });
    const icons = result.map((r) => r.icon);
    expect(icons).toContain('github');
    expect(icons).toContain('twitter');
    expect(icons).toContain('x.com');
    expect(icons).toContain('discord');
    expect(icons).toContain('mastodon');
    expect(icons).toContain('linkedin');
    expect(icons).toContain('youtube');
  });

  it('falls back to the trailing icon path segment for unknown icons', () => {
    const result = extractSocial({
      social: [
        { icon: 'fontawesome/brands/funky-network', link: 'https://example.com' },
      ],
    });
    expect(result[0]?.icon).toBe('funky-network');
  });

  it('skips entries without a link', () => {
    const result = extractSocial({
      social: [{ icon: 'fontawesome/brands/github' }],
    });
    expect(result).toEqual([]);
  });

  it('preserves order from the input', () => {
    const result = extractSocial({
      social: [
        { icon: 'fontawesome/brands/github', link: 'a' },
        { icon: 'fontawesome/brands/discord', link: 'b' },
      ],
    });
    expect(result.map((r) => r.href)).toEqual(['a', 'b']);
  });
});

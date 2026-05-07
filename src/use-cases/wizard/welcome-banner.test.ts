import { describe, expect, it } from 'vitest';
import type { Highlighter } from '../../domain/wizard/ports/prompter.js';
import { welcomeBanner } from './welcome-banner.js';

const identity: Highlighter = {
  name: (t) => t,
  url: (t) => t,
  value: (t) => t,
  count: (t) => t,
  dim: (t) => t,
};

describe('welcomeBanner', () => {
  it('mentions both the source and target ecosystems', () => {
    const banner = welcomeBanner(identity);
    expect(banner).toContain('mkdocs-material');
    expect(banner).toContain('astro-starlight');
  });

  it('includes a directional/magical separator between source and target', () => {
    // Accept any of the conventional separators we might use over time —
    // arrow forms or the magic wand. Pinned only loosely so the glyph can
    // evolve without churning tests.
    expect(welcomeBanner(identity)).toMatch(/→|->|▶|🪄/);
  });

  it('routes project-name decoration through the Highlighter so NO_COLOR / non-TTY runs degrade to plain text', () => {
    // The Highlighter port is the single styling vocabulary the wizard speaks.
    // Importing picocolors directly here would couple the use-case to ANSI and
    // break the test fakes that wire identity decorators.
    const calls: string[] = [];
    const tracking: Highlighter = {
      name: (t) => {
        calls.push(t);
        return `[name]${t}[/name]`;
      },
      url: (t) => t,
      value: (t) => t,
      count: (t) => t,
      dim: (t) => t,
    };
    const banner = welcomeBanner(tracking);
    expect(calls).toContain('mkdocs-material');
    expect(calls).toContain('astro-starlight');
    expect(banner).toContain('[name]mkdocs-material[/name]');
    expect(banner).toContain('[name]astro-starlight[/name]');
  });

  it('ends with a trailing newline so it composes cleanly above the next output line', () => {
    expect(welcomeBanner(identity).endsWith('\n')).toBe(true);
  });

  it('includes a star/asterisk shower using a mix of geometric and kawaii glyphs for depth', () => {
    // The shower is visual atmosphere, not load-bearing. Test asserts the
    // intent (broad glyph variety appears) rather than pinning exact spacing
    // or counts — leaves room to tune density without churning tests.
    const banner = welcomeBanner(identity);
    const sparkles = ['·', '✦', '✧', '☆', 'ﾟ', '。', 'o', '*', '+', '.'];
    const matched = sparkles.filter((g) => banner.includes(g));
    // Six+ distinct glyphs ensures we have both the geometric stars (✦ ✧ ·)
    // and the kawaii twinkles (ﾟ ☆ 。 o) — neither family alone, mixed.
    expect(matched.length).toBeGreaterThanOrEqual(6);
  });

  it('renders multiple staggered shower rows above the title for a parallax depth feel', () => {
    const banner = welcomeBanner(identity);
    // Find the title row, then count how many shower-only rows precede it.
    const lines = banner.split('\n');
    const titleIdx = lines.findIndex((l) => l.includes('mkdocs-material'));
    expect(titleIdx).toBeGreaterThan(0);
    const showerRowsAbove = lines.slice(0, titleIdx).filter((l) => /[ﾟ☆·✦✧｡。o*+]/.test(l));
    // At least three rows so the gradient (sparse → dense) is visible. We
    // intentionally don't pin the exact count — leaves room to tune the stack
    // without churning tests.
    expect(showerRowsAbove.length).toBeGreaterThanOrEqual(3);
  });

  it('renders a few trailing shower rows below the tagline for a falling-twinkle aftermath', () => {
    const banner = welcomeBanner(identity);
    const lines = banner.split('\n');
    const taglineIdx = lines.findIndex((l) => l.includes('Convert MkDocs Material'));
    expect(taglineIdx).toBeGreaterThan(0);
    const showerRowsBelow = lines.slice(taglineIdx + 1).filter((l) => /[ﾟ☆·✦✧｡。o*+]/.test(l));
    expect(showerRowsBelow.length).toBeGreaterThanOrEqual(1);
  });

  it('routes shower glyphs through the Highlighter dim() so they fade in TTY and degrade in NO_COLOR', () => {
    const dimmedFragments: string[] = [];
    const tracking: Highlighter = {
      name: (t) => t,
      url: (t) => t,
      value: (t) => t,
      count: (t) => t,
      dim: (t) => {
        dimmedFragments.push(t);
        return `<dim>${t}</dim>`;
      },
    };
    const banner = welcomeBanner(tracking);
    // The shower row went through dim() at least once.
    expect(dimmedFragments.length).toBeGreaterThan(0);
    expect(banner).toContain('<dim>');
  });
});

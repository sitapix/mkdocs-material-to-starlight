import { describe, expect, it } from 'vitest';
import { normalizeButtons } from './buttons.js';

describe('normalizeButtons', () => {
  it('passes through text containing no button markers', () => {
    const src = '# Heading\n\nA plain [link](url) and a paragraph.\n';
    expect(normalizeButtons(src)).toBe(src);
  });

  it('rewrites .md-button to <LinkButton variant="secondary">', () => {
    const src = '[Subscribe](https://example.com){ .md-button }\n';
    expect(normalizeButtons(src)).toBe(
      '<LinkButton href="https://example.com" variant="secondary">Subscribe</LinkButton>\n',
    );
  });

  it('rewrites .md-button .md-button--primary to <LinkButton variant="primary">', () => {
    const src = '[Sign up](#){ .md-button .md-button--primary }\n';
    expect(normalizeButtons(src)).toBe(
      '<LinkButton href="#" variant="primary">Sign up</LinkButton>\n',
    );
  });

  it('rewrites a button mid-paragraph without disturbing surrounding prose', () => {
    const src = 'Click [Subscribe](url){ .md-button } to follow.\n';
    expect(normalizeButtons(src)).toBe(
      'Click <LinkButton href="url" variant="secondary">Subscribe</LinkButton> to follow.\n',
    );
  });

  it('leaves ordinary attr_list classes (e.g. .youtube on icons) untouched', () => {
    const src = ':material-youtube:{ .youtube }\n';
    expect(normalizeButtons(src)).toBe(src);
  });

  it('does not rewrite button markers inside fenced code', () => {
    const src = ['```', '[Click](url){ .md-button }', '```', ''].join('\n');
    expect(normalizeButtons(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = '[Hi](u){ .md-button .md-button--primary }\n';
    const once = normalizeButtons(src);
    expect(normalizeButtons(once)).toBe(once);
  });

  it('rewrites multiple buttons on the same line independently', () => {
    const src = '[A](a){ .md-button } and [B](b){ .md-button .md-button--primary }\n';
    expect(normalizeButtons(src)).toBe(
      '<LinkButton href="a" variant="secondary">A</LinkButton> and <LinkButton href="b" variant="primary">B</LinkButton>\n',
    );
  });

  it('strips a leading Material icon shortcode from the label', () => {
    const src = '[:material-rocket: Launch](launch.md){ .md-button .md-button--primary }\n';
    const out = normalizeButtons(src);
    expect(out).toContain('<LinkButton href="launch.md" variant="primary"');
    expect(out).toContain('>Launch</LinkButton>');
    // Shortcode must not survive in the visible label
    expect(out).not.toContain(':material-rocket:');
  });

  it('promotes a resolvable Material icon to the icon prop', () => {
    // :material-rocket-launch: resolves to the Starlight built-in "rocket".
    const src = '[:material-rocket-launch: Go](go.md){ .md-button }\n';
    const out = normalizeButtons(src);
    expect(out).toMatch(/<LinkButton[^>]*icon="rocket"[^>]*>/);
    expect(out).toContain('>Go</LinkButton>');
  });

  it('strips a trailing Material icon shortcode from the label', () => {
    const src = '[Continue :material-arrow-right:](next.md){ .md-button }\n';
    const out = normalizeButtons(src);
    expect(out).toContain('>Continue</LinkButton>');
    expect(out).not.toContain(':material-arrow-right:');
  });

  it('escapes double quotes in the href to keep the JSX attribute well-formed', () => {
    const src = '[Open](https://example.com/?q="hi"){ .md-button }\n';
    const out = normalizeButtons(src);
    expect(out).toContain('href="https://example.com/?q=&quot;hi&quot;"');
  });

  describe('verbatim Material docs examples (squidfunk.github.io/mkdocs-material/reference/buttons/)', () => {
    it('"Adding buttons" example renders <LinkButton variant="secondary">', () => {
      const src = '[Subscribe to our newsletter](#){ .md-button }\n';
      expect(normalizeButtons(src)).toBe(
        '<LinkButton href="#" variant="secondary">Subscribe to our newsletter</LinkButton>\n',
      );
    });

    it('"Adding primary buttons" example renders <LinkButton variant="primary">', () => {
      const src = '[Subscribe to our newsletter](#){ .md-button .md-button--primary }\n';
      expect(normalizeButtons(src)).toBe(
        '<LinkButton href="#" variant="primary">Subscribe to our newsletter</LinkButton>\n',
      );
    });

    it('"Adding icon buttons" example maps paper-plane to forward-slash (Starlight\'s paper-airplane glyph)', () => {
      // `fontawesome-solid-paper-plane` is now in our curated icon mapping
      // (the canonical button-icon example in Material's docs). Resolves
      // to Starlight\'s `forward-slash` icon — the paper-airplane glyph.
      const src = '[Send :fontawesome-solid-paper-plane:](#){ .md-button }\n';
      const out = normalizeButtons(src);
      expect(out).toContain(
        '<LinkButton href="#" variant="secondary" icon="forward-slash">Send</LinkButton>',
      );
      expect(out).not.toContain(':fontawesome-solid-paper-plane:');
    });

    it('icon button with a mapped Material icon promotes to icon prop', () => {
      // :material-arrow-right: maps to a Starlight built-in via icon-mappings.
      const src = '[Continue :material-arrow-right:](#){ .md-button .md-button--primary }\n';
      const out = normalizeButtons(src);
      expect(out).toMatch(
        /<LinkButton[^>]*variant="primary"[^>]*icon="[^"]+"[^>]*>Continue<\/LinkButton>/,
      );
    });
  });
});

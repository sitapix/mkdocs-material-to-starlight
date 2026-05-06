import { describe, expect, it } from 'vitest';
import { normalizeHtmlBlockSpacing } from './html-block-spacing.js';

describe('normalizeHtmlBlockSpacing', () => {
  it('inserts a blank line after `<div>` when the next line is non-blank', () => {
    const src = '<div class="x">\n[link](url)\n</div>\n';
    const out = normalizeHtmlBlockSpacing(src);
    expect(out).toContain('<div class="x">\n\n[link]');
  });

  it('inserts a blank line before `</div>` when the previous line is non-blank', () => {
    const src = '<div>\n\n[link](url)\n</div>\n';
    const out = normalizeHtmlBlockSpacing(src);
    expect(out).toContain('[link](url)\n\n</div>');
  });

  it('does not duplicate an existing blank line', () => {
    const src = '<div>\n\n[link](url)\n\n</div>\n';
    const out = normalizeHtmlBlockSpacing(src);
    expect(out).toBe(src);
  });

  it('is idempotent', () => {
    const src = '<div class="x">\n[a](b)\n</div>\n\nNext.\n';
    const once = normalizeHtmlBlockSpacing(src);
    const twice = normalizeHtmlBlockSpacing(once);
    expect(twice).toBe(once);
  });

  it('does not pad void elements like <br>', () => {
    // `<br>` doesn't open a block and is often inline. Pad it and you change
    // semantic line breaks into paragraph boundaries.
    const src = 'before<br>\nafter\n';
    const out = normalizeHtmlBlockSpacing(src);
    expect(out).toBe(src);
  });

  it('preserves content inside fenced code blocks', () => {
    const src = '```\n<div>\n[link](url)\n</div>\n```\n';
    expect(normalizeHtmlBlockSpacing(src)).toBe(src);
  });

  it('handles the real DDEV regression (link with icons inside <div style=...>)', () => {
    const src = [
      '<div style="display: grid;">',
      '[Download :material-download:](https://example.com)',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeHtmlBlockSpacing(src);
    // Both the opener and closer must end up isolated from the link line.
    expect(out).toMatch(/<div style="display: grid;">\n\n\[Download/);
    expect(out).toMatch(/\(https:\/\/example\.com\)\n\n<\/div>/);
  });

  it('does NOT pad a tag that has trailing inline content', () => {
    // `<div>inline text</div>` on a single line is inline HTML (or short form);
    // padding would split it into multiple blocks. Only standalone tag lines
    // get padded.
    const src = 'before <div>x</div> after\n';
    expect(normalizeHtmlBlockSpacing(src)).toBe(src);
  });

  it('pads a tag with multiple attributes', () => {
    const src = '<section id="x" class="y">\nbody\n</section>\n';
    const out = normalizeHtmlBlockSpacing(src);
    expect(out).toContain('<section id="x" class="y">\n\nbody');
    expect(out).toContain('body\n\n</section>');
  });
});

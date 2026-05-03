import { describe, expect, it } from 'vitest';
import { normalizeButtons } from './buttons.js';

describe('normalizeButtons', () => {
  it('passes through text containing no button markers', () => {
    const src = '# Heading\n\nA plain [link](url) and a paragraph.\n';
    expect(normalizeButtons(src)).toBe(src);
  });

  it('rewrites a basic .md-button link into an anchor with class', () => {
    const src = '[Subscribe](https://example.com){ .md-button }\n';
    expect(normalizeButtons(src)).toBe(
      '<a href="https://example.com" class="md-button">Subscribe</a>\n',
    );
  });

  it('preserves the primary modifier as a second class', () => {
    const src = '[Sign up](#){ .md-button .md-button--primary }\n';
    expect(normalizeButtons(src)).toBe(
      '<a href="#" class="md-button md-button--primary">Sign up</a>\n',
    );
  });

  it('rewrites a button mid-paragraph without disturbing surrounding prose', () => {
    const src = 'Click [Subscribe](url){ .md-button } to follow.\n';
    expect(normalizeButtons(src)).toBe(
      'Click <a href="url" class="md-button">Subscribe</a> to follow.\n',
    );
  });

  it('leaves ordinary attr_list classes (e.g. .youtube on icons) untouched', () => {
    const src = ':material-youtube:{ .youtube }\n';
    expect(normalizeButtons(src)).toBe(src);
  });

  it('does not rewrite button markers inside fenced code', () => {
    const src = [
      '```',
      '[Click](url){ .md-button }',
      '```',
      '',
    ].join('\n');
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
      '<a href="a" class="md-button">A</a> and <a href="b" class="md-button md-button--primary">B</a>\n',
    );
  });
});

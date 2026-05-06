import { describe, expect, it } from 'vitest';
import { quoteUnquotedHtmlAttrs } from './quote-unquoted-attrs.js';

describe('quoteUnquotedHtmlAttrs', () => {
  it('quotes a single unquoted attribute value', () => {
    // Real-world (thoughtspot/cs_tools/changelog/1-4-0.md): a
    // `<div class=grid-define-columns ...>` mid-document. HTML accepts
    // unquoted values that lack whitespace/quotes; JSX/MDX rejects them
    // with "Unexpected character `g` before attribute value, expected a
    // character that can start an attribute value, such as `"`, `'`, or
    // `{`".
    const src = '<div class=grid-define-columns>x</div>\n';
    expect(quoteUnquotedHtmlAttrs(src)).toBe('<div class="grid-define-columns">x</div>\n');
  });

  it('quotes multiple unquoted attributes side by side', () => {
    const src = '<div class=grid-define-columns data-columns=2 markdown="block">\n';
    const out = quoteUnquotedHtmlAttrs(src);
    expect(out).toContain('class="grid-define-columns"');
    expect(out).toContain('data-columns="2"');
    // Already-quoted attrs pass through untouched.
    expect(out).toContain('markdown="block"');
  });

  it('leaves already-quoted attributes alone', () => {
    const src = '<a href="https://example.com" target="_blank">x</a>\n';
    expect(quoteUnquotedHtmlAttrs(src)).toBe(src);
  });

  it('leaves JSX expression attributes alone', () => {
    const src = '<MyTag count={n} icon={<Icon />}>x</MyTag>\n';
    expect(quoteUnquotedHtmlAttrs(src)).toBe(src);
  });

  it('leaves boolean (valueless) attributes alone', () => {
    const src = '<input disabled checked />\n';
    expect(quoteUnquotedHtmlAttrs(src)).toBe(src);
  });

  it('skips fenced code blocks', () => {
    const src = '```html\n<div class=foo>x</div>\n```\n';
    expect(quoteUnquotedHtmlAttrs(src)).toBe(src);
  });

  it('skips inline code spans', () => {
    const src = 'See `<div class=foo>` for an example.\n';
    expect(quoteUnquotedHtmlAttrs(src)).toBe(src);
  });

  it('handles closing tags without changes', () => {
    const src = '<div class=foo>body</div>\n';
    expect(quoteUnquotedHtmlAttrs(src)).toBe('<div class="foo">body</div>\n');
  });

  it('is idempotent', () => {
    const src = '<div class=foo data-x=1 markdown="block">\n';
    const once = quoteUnquotedHtmlAttrs(src);
    expect(quoteUnquotedHtmlAttrs(once)).toBe(once);
  });
});

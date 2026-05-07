import { describe, expect, it } from 'vitest';
import { normalizeJinjaInLinkUrls } from './jinja-in-urls.js';

describe('normalizeJinjaInLinkUrls', () => {
  it('entity-escapes {{...}} sitting inside a markdown link URL and URL-encodes whitespace', () => {
    // Real-world (cv4x_svstudio-manual): without this normalizer,
    // remark-parse refuses the link entirely and stringifies it as
    // escaped plain text, which then cascades into MDX acorn errors.
    // Whitespace inside the brace body must also be URL-encoded —
    // CommonMark §6.6 link destinations in parentheses cannot contain
    // unescaped spaces, so the entity-escape alone is not enough.
    const src = '[text {{ x }}](https://example.com/commit/{{ x }})\n';
    const out = normalizeJinjaInLinkUrls(src);
    expect(out).toBe(
      '[text {{ x }}](https://example.com/commit/&#123;&#123;%20x%20&#125;&#125;)\n',
    );
  });

  it('leaves {{...}} in link TEXT untouched (handled by escape-jsx-expressions later)', () => {
    const src = 'Use [{{ var }} here](https://example.com).\n';
    expect(normalizeJinjaInLinkUrls(src)).toBe(src);
  });

  it('leaves bare prose {{...}} alone', () => {
    const src = 'Plain prose with {{ var }} placeholder.\n';
    expect(normalizeJinjaInLinkUrls(src)).toBe(src);
  });

  it('handles nested parens inside the URL', () => {
    // Wikipedia-style URL with parens inside.
    const src = '[wiki](https://en.wikipedia.org/wiki/Test_(disambiguation)/{{ x }})\n';
    const out = normalizeJinjaInLinkUrls(src);
    expect(out).toContain('disambiguation)/&#123;&#123;%20x%20&#125;&#125;)');
  });

  it('does not touch fenced code', () => {
    const src = '```\n[a](b/{{ x }})\n```\n';
    expect(normalizeJinjaInLinkUrls(src)).toBe(src);
  });

  it('does not touch `]( ` inside an inline backtick span', () => {
    const src = 'See `[a](b/{{ x }})` example.\n';
    expect(normalizeJinjaInLinkUrls(src)).toBe(src);
  });

  it('escapes {% %} blocks and {# #} comments inside URLs too', () => {
    const out = normalizeJinjaInLinkUrls('[a](https://x/{% raw %})\n');
    expect(out).toBe('[a](https://x/&#123;%%20raw%20%&#125;)\n');
    const out2 = normalizeJinjaInLinkUrls('[a](https://x/{# comment #})\n');
    expect(out2).toBe('[a](https://x/&#123;#%20comment%20#&#125;)\n');
  });

  it('is idempotent', () => {
    const src = '[a](https://x/{{ var }})\n';
    const once = normalizeJinjaInLinkUrls(src);
    const twice = normalizeJinjaInLinkUrls(once);
    expect(twice).toBe(once);
  });
});

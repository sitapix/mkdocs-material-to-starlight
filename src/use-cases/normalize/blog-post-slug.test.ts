import { describe, expect, it } from 'vitest';
import { normalizeBlogPostSlug } from './blog-post-slug.js';

const doc = (fm: string): string => `---\n${fm}\n---\n\nBody.\n`;

describe('normalizeBlogPostSlug', () => {
  it('prefixes an authored slug with the blog posts namespace', () => {
    // Field-tested (squidfunk/mkdocs-material `mkdocs-2.0.md`): Material
    // reads `slug:` as the post URL tail; Starlight reads it as the
    // absolute page slug, tearing the post out of starlight-blog's prefix
    // and crashing the build with "Failed to get blog configuration".
    const out = normalizeBlogPostSlug(doc('title: X\nslug: mkdocs-2.0'), 'blog/posts');
    expect(out.text).toContain('slug: blog/posts/mkdocs-2.0');
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0]?.ruleId).toBe('blog-post-slug-prefixed');
  });

  it('preserves quoting style on quoted slug values', () => {
    const out = normalizeBlogPostSlug(doc("slug: 'my-post'"), 'blog/posts');
    expect(out.text).toContain("slug: 'blog/posts/my-post'");
  });

  it('is idempotent: already-prefixed slugs pass through untouched', () => {
    const src = doc('slug: blog/posts/mkdocs-2.0');
    const out = normalizeBlogPostSlug(src, 'blog/posts');
    expect(out.text).toBe(src);
    expect(out.diagnostics).toHaveLength(0);
  });

  it('leaves posts without a slug untouched', () => {
    const src = doc('title: X\ndate: 2026-02-18');
    const out = normalizeBlogPostSlug(src, 'blog/posts');
    expect(out.text).toBe(src);
    expect(out.diagnostics).toHaveLength(0);
  });

  it('ignores slug-like lines outside the frontmatter block', () => {
    const src = `---\ntitle: X\n---\n\nslug: not-frontmatter\n`;
    const out = normalizeBlogPostSlug(src, 'blog/posts');
    expect(out.text).toBe(src);
  });
});

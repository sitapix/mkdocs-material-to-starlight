import { describe, expect, it } from 'vitest';
import { translateBlogOptions } from './blog-options.js';

describe('translateBlogOptions', () => {
  it('emits the default `blog/posts` prefix when options are empty (Material default blog_dir)', () => {
    // The function is only invoked when `plugins.blog` is enabled in
    // mkdocs.yml. Material's default `blog_dir` is `'blog'`, with posts
    // under `blog/posts/`. starlight-blog's own default `'blog'` is
    // wrong for any Material site that has non-post files (index, tags)
    // alongside the posts subdirectory — so we emit the correct mapping
    // even when the user didn't override `blog_dir` explicitly.
    expect(translateBlogOptions({})).toBe("{ prefix: 'blog/posts' }");
    expect(translateBlogOptions({ unknown_key: 'x' })).toBe("{ prefix: 'blog/posts' }");
  });

  it('translates blog_dir to a navigation prefix with `/posts` appended', () => {
    // Material's blog plugin treats `<blog_dir>/posts/*` as the actual
    // posts; sibling files in `<blog_dir>/` are nav pages, not posts.
    // starlight-blog's `prefix:` marks every file under that path as a
    // post, so we need to point at `<blog_dir>/posts` to match.
    const out = translateBlogOptions({ blog_dir: 'blog' });
    expect(out).toContain("prefix: 'blog/posts'");
  });

  it('translates pagination_per_page to postsPerPage', () => {
    const out = translateBlogOptions({ pagination_per_page: 7 });
    expect(out).toContain('postsPerPage: 7');
  });

  it('translates draft → recoverDrafts when draft is true', () => {
    const out = translateBlogOptions({ draft: true });
    expect(out).toContain('recoverDrafts: true');
  });

  it('translates draft_on_serve into a dev-mode flag', () => {
    const out = translateBlogOptions({ draft_on_serve: true });
    expect(out).toContain('recoverDrafts: true');
  });

  it('translates authors mapping to authors object', () => {
    const out = translateBlogOptions({
      authors: {
        alice: { name: 'Alice', url: 'https://example.com', avatar: '/img/a.png' },
      },
    });
    expect(out).toContain('authors:');
    expect(out).toContain(
      "alice: { name: 'Alice', url: 'https://example.com', picture: '/img/a.png' }",
    );
  });

  it('translates categories_allowed to a category whitelist comment', () => {
    const out = translateBlogOptions({ categories_allowed: ['announcements', 'tutorials'] });
    expect(out).toContain('categories:');
    expect(out).toContain("'announcements'");
    expect(out).toContain("'tutorials'");
  });

  it('translates post_excerpt_separator into excerpt config', () => {
    const out = translateBlogOptions({ post_excerpt_separator: '<!-- more -->' });
    expect(out).toContain('excerpt:');
    expect(out).toContain("'<!-- more -->'");
  });

  it('emits a single object literal that can be passed to starlightBlog', () => {
    const out = translateBlogOptions({
      blog_dir: 'news',
      pagination_per_page: 5,
      draft: true,
    });
    expect(out.startsWith('{')).toBe(true);
    expect(out.endsWith('}')).toBe(true);
    expect(out).toContain("prefix: 'news/posts'");
    expect(out).toContain('postsPerPage: 5');
    expect(out).toContain('recoverDrafts: true');
  });

  it('idempotent: translating twice yields identical output', () => {
    const opts = { blog_dir: 'b', pagination_per_page: 3 };
    expect(translateBlogOptions(opts)).toBe(translateBlogOptions(opts));
  });

  it('escapes single quotes in string values', () => {
    const out = translateBlogOptions({ post_excerpt_separator: "it's more" });
    expect(out).toContain("'it\\'s more'");
  });
});

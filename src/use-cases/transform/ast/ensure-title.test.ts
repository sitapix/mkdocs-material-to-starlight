import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import { ensureTitle } from './ensure-title.js';

function process(source: string, sourcePath: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(ensureTitle, { sourcePath })
    .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
    .processSync(source);
  return String(file);
}

describe('ensureTitle', () => {
  it('preserves an existing title in frontmatter', () => {
    const out = process('---\ntitle: Existing\n---\n\nbody\n', 'index.md');
    expect(out).toContain('title: Existing');
    expect(out.match(/title:/g)?.length).toBe(1);
  });

  it('synthesizes a title from the first H1 when none in frontmatter', () => {
    const out = process('# Welcome to the site\n\nbody\n', 'index.md');
    expect(out).toContain('title: Welcome to the site');
  });

  it('derives a title from the filename when no H1 and no frontmatter', () => {
    const out = process('plain body\n', 'getting-started.md');
    expect(out).toContain('title: Getting Started');
  });

  it('humanizes nested filenames using the basename', () => {
    const out = process('plain\n', 'api/auth-tokens.md');
    expect(out).toContain('title: Auth Tokens');
  });

  it('uses index.md → "Home" by convention', () => {
    const out = process('plain\n', 'index.md');
    expect(out).toContain('title: Home');
  });

  it('preserves an existing description when present alongside synthesized title', () => {
    const out = process('---\ndescription: A page.\n---\n\n# Real Title\n', 'index.md');
    expect(out).toContain('title: Real Title');
    expect(out).toContain('description: A page.');
  });

  it('quotes titles containing colons or special YAML characters', () => {
    const out = process('# Foo: bar\n', 'page.md');
    expect(out).toMatch(/title:\s+["']?Foo:\s*bar["']?/);
  });

  it('is idempotent — re-running on output does not duplicate', () => {
    const first = process('# Hello\n\nbody\n', 'page.md');
    const second = process(first, 'page.md');
    expect(second).toBe(first);
  });
});

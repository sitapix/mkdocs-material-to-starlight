import { describe, expect, it } from 'vitest';
import { scanFrontmatterFields } from './scan-frontmatter-fields.js';

describe('scanFrontmatterFields', () => {
  it('returns no diagnostics for source with no frontmatter', () => {
    expect(scanFrontmatterFields('# Heading\n\nA paragraph.\n')).toHaveLength(0);
  });

  it('returns no diagnostics for plain frontmatter (title, description, tags)', () => {
    const src = ['---', 'title: Hello', 'description: x', 'tags: [a, b]', '---', ''].join(
      '\n',
    );
    expect(scanFrontmatterFields(src)).toHaveLength(0);
  });

  describe('search.boost', () => {
    it('emits an info diagnostic when search.boost: <number> appears', () => {
      const src = ['---', 'search:', '  boost: 2', '---', ''].join('\n');
      const diags = scanFrontmatterFields(src);
      const d = diags.find((x) => x.ruleId === 'frontmatter-search-boost');
      expect(d).toBeDefined();
      expect(d?.severity).toBe('info');
      expect(d?.message).toMatch(/pagefind/i);
    });
  });

  describe('search.exclude', () => {
    it('emits an info diagnostic when search.exclude: true appears', () => {
      const src = ['---', 'search:', '  exclude: true', '---', ''].join('\n');
      const diags = scanFrontmatterFields(src);
      const d = diags.find((x) => x.ruleId === 'frontmatter-search-exclude');
      expect(d).toBeDefined();
      expect(d?.message).toMatch(/pagefind: false/);
    });
  });

  describe('blog post unsupported fields', () => {
    it('emits an info diagnostic for categories', () => {
      const src = ['---', 'categories:', '  - News', '---', ''].join('\n');
      const diags = scanFrontmatterFields(src);
      const d = diags.find((x) => x.ruleId === 'frontmatter-blog-categories');
      expect(d).toBeDefined();
      expect(d?.message).toMatch(/starlight-blog/);
    });

    it('emits an info diagnostic for pin', () => {
      const src = ['---', 'pin: true', '---', ''].join('\n');
      const diags = scanFrontmatterFields(src);
      expect(
        diags.find((x) => x.ruleId === 'frontmatter-blog-pin'),
      ).toBeDefined();
    });

    it('emits an info diagnostic for links: (related-reading list)', () => {
      const src = ['---', 'links:', '  - other.md', '---', ''].join('\n');
      const diags = scanFrontmatterFields(src);
      expect(
        diags.find((x) => x.ruleId === 'frontmatter-blog-links'),
      ).toBeDefined();
    });
  });

  it('emits multiple diagnostics when several Material-only fields coexist', () => {
    const src = [
      '---',
      'search:',
      '  boost: 5',
      '  exclude: true',
      'pin: true',
      'categories:',
      '  - News',
      '---',
      '',
    ].join('\n');
    const diags = scanFrontmatterFields(src);
    const ids = diags.map((d) => d.ruleId).sort();
    expect(ids).toEqual([
      'frontmatter-blog-categories',
      'frontmatter-blog-pin',
      'frontmatter-search-boost',
      'frontmatter-search-exclude',
    ]);
  });

  it('does not match fields appearing outside the leading frontmatter block', () => {
    const src = [
      '# Heading',
      '',
      'pin: true',
      '',
      'search:',
      '  boost: 2',
      '',
    ].join('\n');
    expect(scanFrontmatterFields(src)).toHaveLength(0);
  });

  describe('social cards per-page customization', () => {
    it('emits info when social.cards: false is set in frontmatter', () => {
      const src = ['---', 'social:', '  cards: false', '---', ''].join('\n');
      const diags = scanFrontmatterFields(src);
      expect(
        diags.find((d) => d.ruleId === 'frontmatter-social-cards'),
      ).toBeDefined();
    });

    it('emits info when social.cards_layout is set', () => {
      const src = ['---', 'social:', '  cards_layout: custom', '---', ''].join('\n');
      const diags = scanFrontmatterFields(src);
      const d = diags.find((x) => x.ruleId === 'frontmatter-social-cards');
      expect(d).toBeDefined();
      expect(d?.message).toMatch(/astro-og-canvas|cards_layout/i);
    });

    it('does not emit when no social: block is present', () => {
      const src = ['---', 'title: x', '---', ''].join('\n');
      const diags = scanFrontmatterFields(src);
      expect(
        diags.find((d) => d.ruleId === 'frontmatter-social-cards'),
      ).toBeUndefined();
    });
  });
});

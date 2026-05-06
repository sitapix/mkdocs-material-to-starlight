import { describe, expect, it } from 'vitest';
import { normalizeFrontmatterTemplate } from './frontmatter-template.js';

describe('normalizeFrontmatterTemplate', () => {
  it('strips a non-Starlight template like `template: project.html`', () => {
    const src = ['---', 'title: Project', 'template: project.html', '---', '', 'Body'].join('\n');
    const out = normalizeFrontmatterTemplate(src);
    expect(out).not.toContain('template:');
    expect(out).toContain('title: Project');
    expect(out).toContain('Body');
  });

  it('preserves a valid `template: doc` value', () => {
    const src = ['---', 'title: T', 'template: doc', '---', ''].join('\n');
    expect(normalizeFrontmatterTemplate(src)).toContain('template: doc');
  });

  it('preserves a valid `template: splash` value', () => {
    const src = ['---', 'title: T', 'template: splash', '---', ''].join('\n');
    expect(normalizeFrontmatterTemplate(src)).toContain('template: splash');
  });

  it('strips quoted Material templates (`template: "article_list.html"`)', () => {
    const src = ['---', 'title: T', "template: 'article_list.html'", '---', ''].join('\n');
    const out = normalizeFrontmatterTemplate(src);
    expect(out).not.toContain('article_list.html');
    expect(out).not.toMatch(/^template:/m);
  });

  it('passes through frontmatter that has no template key', () => {
    const src = ['---', 'title: T', '---', '', 'Body'].join('\n');
    expect(normalizeFrontmatterTemplate(src)).toBe(src);
  });

  it('leaves body content with `template:` text unchanged', () => {
    // Body-level mention should not be touched, only frontmatter.
    const src = '# Heading\n\nUse `template: foo.html` in your config.\n';
    expect(normalizeFrontmatterTemplate(src)).toBe(src);
  });

  it('idempotent: a second pass leaves output unchanged', () => {
    const src = ['---', 'title: P', 'template: project.html', '---', ''].join('\n');
    const once = normalizeFrontmatterTemplate(src);
    expect(normalizeFrontmatterTemplate(once)).toBe(once);
  });

  it('handles multi-line frontmatter with other keys around the template line', () => {
    const src = [
      '---',
      'title: P',
      'description: Some desc',
      'template: project.html',
      'tags:',
      '  - foo',
      '---',
      '',
      'Body',
    ].join('\n');
    const out = normalizeFrontmatterTemplate(src);
    expect(out).toContain('description: Some desc');
    expect(out).toContain('tags:');
    expect(out).toContain('- foo');
    expect(out).not.toContain('template: project.html');
  });

  describe('layout: stripping (Material Insiders Jinja hints)', () => {
    it('strips bare-identifier `layout: homepage`', () => {
      // Real-world (microsoft/Mastering-the-Marketplace/docs/index.md):
      // Material Insiders source uses `layout: homepage` to point at a
      // Jinja partial. Astro's MDX integration interprets this as
      // `import homepage from 'homepage'` — Rollup fails to resolve.
      const src = '---\ntitle: Home\nlayout: homepage\n---\nbody\n';
      const out = normalizeFrontmatterTemplate(src);
      expect(out).not.toContain('layout: homepage');
      expect(out).toContain('title: Home');
    });

    it('strips `layout: default`', () => {
      const src = '---\ntitle: Page\nlayout: default\n---\nbody\n';
      expect(normalizeFrontmatterTemplate(src)).not.toContain('layout:');
    });

    it('preserves real Astro layout path `./MyLayout.astro`', () => {
      const src = '---\ntitle: P\nlayout: ./MyLayout.astro\n---\nbody\n';
      expect(normalizeFrontmatterTemplate(src)).toContain('layout: ./MyLayout.astro');
    });

    it('preserves absolute layout path `/layouts/foo.astro`', () => {
      const src = '---\ntitle: P\nlayout: /layouts/foo.astro\n---\nbody\n';
      expect(normalizeFrontmatterTemplate(src)).toContain('layout: /layouts/foo.astro');
    });

    it('handles CRLF line endings', () => {
      const src = '---\r\ntitle: P\r\nlayout: homepage\r\n---\r\nbody\r\n';
      const out = normalizeFrontmatterTemplate(src);
      expect(out).not.toContain('layout: homepage');
      expect(out).toContain('---\r\ntitle: P\r\n---');
    });
  });
});

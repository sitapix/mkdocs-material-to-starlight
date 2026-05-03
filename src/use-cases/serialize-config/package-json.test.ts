import { describe, expect, it } from 'vitest';
import { serializePackageJson } from './package-json.js';

describe('serializePackageJson', () => {
  it('produces a buildable package.json for the generated Starlight project', () => {
    const out = serializePackageJson({
      siteName: 'My Docs',
      siteDescription: null,
    });
    const parsed = JSON.parse(out);
    expect(parsed.name).toBe('my-docs');
    expect(parsed.type).toBe('module');
    expect(parsed.dependencies).toMatchObject({
      astro: expect.any(String),
      '@astrojs/starlight': expect.any(String),
    });
    expect(parsed.scripts).toMatchObject({
      dev: 'astro dev',
      build: 'astro build',
      preview: 'astro preview',
    });
  });

  it('slugifies the site name into a package name (lowercase, kebab-case)', () => {
    expect(JSON.parse(serializePackageJson({ siteName: 'Hello World!', siteDescription: null })).name).toBe(
      'hello-world',
    );
    expect(JSON.parse(serializePackageJson({ siteName: '  My Docs  ', siteDescription: null })).name).toBe(
      'my-docs',
    );
  });

  it('preserves the description when present', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: 'A demo project.',
    });
    expect(JSON.parse(out).description).toBe('A demo project.');
  });

  it('omits description when not present', () => {
    const out = serializePackageJson({ siteName: 'X', siteDescription: null });
    expect(JSON.parse(out).description).toBeUndefined();
  });

  it('emits valid pretty-printed JSON ending with a newline', () => {
    const out = serializePackageJson({ siteName: 'X', siteDescription: null });
    expect(out.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('falls back to a sensible name for empty or non-alpha titles', () => {
    expect(JSON.parse(serializePackageJson({ siteName: '!!!', siteDescription: null })).name).toBe(
      'starlight-docs',
    );
    expect(JSON.parse(serializePackageJson({ siteName: '', siteDescription: null })).name).toBe(
      'starlight-docs',
    );
  });

  it('adds math dependencies when math feature is detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['math'],
    });
    const parsed = JSON.parse(out);
    expect(parsed.dependencies).toHaveProperty('remark-math');
    expect(parsed.dependencies).toHaveProperty('rehype-katex');
  });

  it('adds astro-mermaid when mermaid feature is detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['mermaid'],
    });
    expect(JSON.parse(out).dependencies).toHaveProperty('astro-mermaid');
  });

  it('adds @astrojs/rss when rss feature is detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['rss'],
    });
    expect(JSON.parse(out).dependencies).toHaveProperty('@astrojs/rss');
  });

  it('does not add math or mermaid deps when those features are not detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: [],
    });
    const parsed = JSON.parse(out);
    expect(parsed.dependencies).not.toHaveProperty('remark-math');
    expect(parsed.dependencies).not.toHaveProperty('rehype-katex');
    expect(parsed.dependencies).not.toHaveProperty('astro-mermaid');
  });

  it('pins @astrojs/starlight to ^0.34.0 or newer (sidebar slug resolver fix)', () => {
    // Starlight 0.30 has a sidebar slug-resolution bug: `astro build` rejects
    // every entry with "The slug X does not exist" even though the entry's
    // .md file is present. Fixed in 0.34. The converter must pin a version
    // that produces buildable output by default.
    const out = serializePackageJson({ siteName: 'X', siteDescription: null });
    const version = JSON.parse(out).dependencies['@astrojs/starlight'];
    // Caret-range with major 0 and minor >= 34
    const match = version.match(/^\^?(\d+)\.(\d+)/);
    expect(match).not.toBeNull();
    const major = Number(match[1]);
    const minor = Number(match[2]);
    expect(major === 0 ? minor >= 34 : major >= 1).toBe(true);
  });
});

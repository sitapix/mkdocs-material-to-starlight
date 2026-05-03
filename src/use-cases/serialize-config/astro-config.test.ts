import { describe, expect, it } from 'vitest';
import { serializeAstroConfig } from './astro-config.js';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';

describe('serializeAstroConfig extraHeadEntries', () => {
  it('emits arbitrary head[] entries (script with content, link tags) alongside extraJsEntries', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      extraHeadEntries: [
        {
          tag: 'script',
          attrs: { async: true, src: 'https://example.com/x.js' },
        },
        {
          tag: 'script',
          content: "console.log('inline')",
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
      ],
    });
    expect(out).toContain("src: 'https://example.com/x.js'");
    expect(out).toContain("content: \"console.log('inline')\"");
    expect(out).toContain("tag: 'link'");
    expect(out).toContain("rel: 'preconnect'");
  });

  it('omits the head block when neither extraJsEntries nor extraHeadEntries are present', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('head:');
  });
});

describe('serializeAstroConfig expressiveCode', () => {
  it('emits an expressiveCode.themes pair when provided', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      expressiveCode: { themes: ['github-light', 'monokai'] },
    });
    expect(out).toContain(`expressiveCode: { themes: ['github-light', 'monokai'] }`);
  });

  it('omits expressiveCode entirely when not provided', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('expressiveCode');
  });
});

describe('serializeAstroConfig', () => {
  it('produces a complete astro.config.mjs file with site name and empty sidebar', () => {
    const out = serializeAstroConfig({
      siteName: 'My Docs',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain(`import { defineConfig } from 'astro/config';`);
    expect(out).toContain(`import starlight from '@astrojs/starlight';`);
    expect(out).toContain(`export default defineConfig`);
    expect(out).toContain(`title: 'My Docs'`);
    expect(out).toContain(`sidebar: []`);
  });

  it('includes site description when present', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: 'A demo.',
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain(`description: 'A demo.'`);
  });

  it('includes site URL when present (top-level Astro setting)', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: 'https://example.com/',
      sidebar: [],
    });
    expect(out).toContain(`site: 'https://example.com/'`);
  });

  it('embeds the serialized sidebar inline', () => {
    const sidebar: ReadonlyArray<SidebarEntry> = [
      { kind: 'slug', slug: '', label: 'Home' },
      { kind: 'group', label: 'API', items: [{ kind: 'slug', slug: 'api/auth' }] },
    ];
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar,
    });
    expect(out).toContain(`label: 'Home'`);
    expect(out).toContain(`label: 'API'`);
    expect(out).toContain(`'api/auth'`);
  });

  it('escapes single quotes in string values', () => {
    const out = serializeAstroConfig({
      siteName: "It's me",
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain(`title: 'It\\'s me'`);
  });

  it('produces output that mentions the integrations array', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain('integrations:');
    expect(out).toContain('starlight(');
  });

  it('imports remark-math and rehype-katex when math feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['math'],
    });
    expect(out).toContain(`import remarkMath from 'remark-math';`);
    expect(out).toContain(`import rehypeKatex from 'rehype-katex';`);
    expect(out).toContain('remarkPlugins:');
    expect(out).toContain('remarkMath');
    expect(out).toContain('rehypePlugins:');
    expect(out).toContain('rehypeKatex');
  });

  it('imports astro-mermaid when mermaid feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['mermaid'],
    });
    expect(out).toContain(`import mermaid from 'astro-mermaid';`);
    expect(out).toContain('mermaid()');
  });

  it('imports starlight-image-zoom as a Starlight plugin when image-zoom is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['image-zoom'],
    });
    expect(out).toContain(`import imageZoom from 'starlight-image-zoom';`);
    expect(out).toContain('plugins: [');
    expect(out).toContain('imageZoom()');
  });

  it('imports starlight-versions as a Starlight plugin when versions is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['versions'],
    });
    expect(out).toContain(`import starlightVersions from 'starlight-versions';`);
    expect(out).toContain('starlightVersions(');
  });

  it('imports starlight-blog when the blog feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['blog'],
    });
    expect(out).toContain(`import starlightBlog from 'starlight-blog';`);
    expect(out).toContain('starlightBlog()');
  });

  it('imports starlight-tags when the tags feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['tags'],
    });
    expect(out).toContain(`import starlightTags from 'starlight-tags';`);
    expect(out).toContain('starlightTags()');
  });

  it('emits a redirects: block when redirects are passed', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      redirects: { '/old/page': '/new/page', '/gone': 'https://elsewhere.example' },
    });
    expect(out).toContain('redirects: {');
    expect(out).toContain(`'/old/page': '/new/page',`);
    expect(out).toContain(`'/gone': 'https://elsewhere.example',`);
  });

  it('omits the redirects: block when no redirects are present', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('redirects:');
  });

  it('emits lastUpdated: true when the last-updated feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['last-updated'],
    });
    expect(out).toContain('lastUpdated: true');
  });

  it('emits defaultLocale and locales when i18n config is provided', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      i18n: {
        defaultLocale: 'en',
        locales: [
          { code: 'en', label: 'English', isDefault: true },
          { code: 'fr', label: 'Français', isDefault: false },
        ],
      },
    });
    expect(out).toContain(`defaultLocale: 'en'`);
    expect(out).toContain('locales: {');
    // Default locale gets the `root` key.
    expect(out).toContain(`root: { label: 'English', lang: 'en' }`);
    // Non-default locales use their code as the key.
    expect(out).toContain(`fr: { label: 'Français', lang: 'fr' }`);
  });

  it('quotes regional locale keys (zh-CN) which are not bare identifiers', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      i18n: {
        defaultLocale: 'en',
        locales: [
          { code: 'en', label: 'English', isDefault: true },
          { code: 'zh-CN', label: '简体中文', isDefault: false },
        ],
      },
    });
    expect(out).toContain(`'zh-CN': { label: '简体中文', lang: 'zh-CN' }`);
  });

  it('omits the i18n block when no i18n config is provided', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('defaultLocale:');
    expect(out).not.toContain('locales: {');
  });

  it('does not import math or mermaid plugins when not detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: [],
    });
    expect(out).not.toContain('remark-math');
    expect(out).not.toContain('rehype-katex');
    expect(out).not.toContain('astro-mermaid');
  });
});

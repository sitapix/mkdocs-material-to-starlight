import { describe, expect, it } from 'vitest';
import { serializeRssEndpoint } from './rss-endpoint.js';

describe('serializeRssEndpoint', () => {
  it('emits a self-contained Astro endpoint that imports @astrojs/rss', () => {
    const out = serializeRssEndpoint({
      siteName: 'My Docs',
      siteDescription: 'Demo description.',
      siteUrl: 'https://example.com',
    });
    expect(out).toContain("import rss from '@astrojs/rss'");
    expect(out).toContain("import { getCollection } from 'astro:content'");
    expect(out).toContain('export async function GET');
  });

  it('embeds the site title and description from mkdocs.yml', () => {
    const out = serializeRssEndpoint({
      siteName: 'My Docs',
      siteDescription: 'Demo description.',
      siteUrl: 'https://example.com',
    });
    expect(out).toContain("title: 'My Docs'");
    expect(out).toContain("description: 'Demo description.'");
  });

  it('falls back to a sensible default description when site_description is null', () => {
    const out = serializeRssEndpoint({
      siteName: 'My Docs',
      siteDescription: null,
      siteUrl: 'https://example.com',
    });
    // Description must always be present in the rss() call.
    expect(out).toMatch(/description:\s*['"]/);
  });

  it('uses context.site as the canonical site URL when site_url is null', () => {
    const out = serializeRssEndpoint({
      siteName: 'My Docs',
      siteDescription: null,
      siteUrl: null,
    });
    expect(out).toContain('site: context.site');
  });

  it('uses an explicit site URL when site_url is provided', () => {
    const out = serializeRssEndpoint({
      siteName: 'My Docs',
      siteDescription: null,
      siteUrl: 'https://example.com',
    });
    expect(out).toContain("site: context.site ?? 'https://example.com'");
  });

  it('maps each docs collection entry into an rss item with a link derived from the slug', () => {
    const out = serializeRssEndpoint({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
    });
    expect(out).toContain("await getCollection('docs')");
    expect(out).toContain('items:');
    expect(out).toMatch(/title:\s+entry\.data\.title/);
    expect(out).toMatch(/link:\s+`\/\$\{entry\.id\}\/`/);
  });

  it('escapes single quotes in title and description so the output is valid TS', () => {
    const out = serializeRssEndpoint({
      siteName: "Joe's Docs",
      siteDescription: "We're great.",
      siteUrl: null,
    });
    expect(out).toContain("title: 'Joe\\'s Docs'");
    expect(out).toContain("description: 'We\\'re great.'");
  });

  it('idempotent: serializing twice with the same input yields identical strings', () => {
    const input = {
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
    } as const;
    expect(serializeRssEndpoint(input)).toBe(serializeRssEndpoint(input));
  });
});

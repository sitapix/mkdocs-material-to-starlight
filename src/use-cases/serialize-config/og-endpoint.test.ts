import { describe, expect, it } from 'vitest';
import { serializeOgEndpoint } from './og-endpoint.js';

describe('serializeOgEndpoint', () => {
  it('emits an Astro endpoint that imports OGImageRoute from astro-og-canvas', () => {
    const out = serializeOgEndpoint({ siteName: 'My Docs' });
    expect(out).toContain("import { OGImageRoute } from 'astro-og-canvas'");
    expect(out).toContain("import { getCollection } from 'astro:content'");
  });

  it('exports getStaticPaths and GET, the two symbols Astro file routes require', () => {
    const out = serializeOgEndpoint({ siteName: 'My Docs' });
    // OGImageRoute returns both symbols; destructured export is idiomatic.
    expect(out).toMatch(/export\s+const\s+\{\s*getStaticPaths,\s*GET\s*\}/);
  });

  it('feeds the docs collection into pages so every page gets a card', () => {
    const out = serializeOgEndpoint({ siteName: 'My Docs' });
    expect(out).toContain("await getCollection('docs')");
    // Either `pages: pages` (explicit) or `pages,` (shorthand) is accepted.
    expect(out).toMatch(/pages[,:]/);
  });

  it('embeds the site name as the default card subtitle (escaping single quotes)', () => {
    const out = serializeOgEndpoint({ siteName: "Joe's Docs" });
    expect(out).toContain("'Joe\\'s Docs'");
  });

  it('idempotent: serializing twice with the same input yields identical strings', () => {
    expect(serializeOgEndpoint({ siteName: 'X' })).toBe(
      serializeOgEndpoint({ siteName: 'X' }),
    );
  });
});

import { describe, expect, it } from 'vitest';
import { needsAttentionPreview } from './needs-attention-preview.js';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';

function makeConfig(over: Partial<MkdocsConfig> = {}): MkdocsConfig {
  return {
    siteName: 'X',
    siteDescription: null,
    siteUrl: null,
    docsDir: 'docs',
    useDirectoryUrls: true,
    copyright: null,
    repoName: null,
    repoUrl: null,
    editUri: null,
    nav: [],
    theme: null,
    plugins: [],
    markdownExtensions: [],
    extras: {},
    ...over,
  };
}

describe('needsAttentionPreview', () => {
  it('returns empty list for a vanilla config', () => {
    expect(needsAttentionPreview(makeConfig())).toEqual([]);
  });

  it('lists detected plugins that need manual attention with docs URLs', () => {
    const config = makeConfig({
      plugins: [
        { name: 'meta', options: {} },
        { name: 'mkdocstrings', options: {} },
      ],
    });
    const items = needsAttentionPreview(config);
    expect(items.length).toBeGreaterThanOrEqual(2);
    const names = items.map((i) => i.name);
    expect(names).toContain('meta');
    expect(names).toContain('mkdocstrings');
    for (const item of items) {
      expect(item.docsUrl, `docs URL for ${item.name}`).toMatch(/^https?:\/\//);
      expect(item.summary.length).toBeGreaterThan(0);
    }
  });

  it('omits info-only plugins that do not need user action', () => {
    // `optimize` and `striphtml` are subsumed by Astro/MDX pipelines and need
    // no user action — they should not show up in the heads-up preview.
    const config = makeConfig({
      plugins: [{ name: 'optimize', options: {} }],
      markdownExtensions: [{ name: 'pymdownx.striphtml', options: {} }],
    });
    expect(needsAttentionPreview(config)).toEqual([]);
  });

  it('deduplicates when the same ruleId is hit by multiple inputs', () => {
    const config = makeConfig({
      plugins: [
        { name: 'mkdocs-swagger-ui-tag', options: {} },
        { name: 'swagger-ui-tag', options: {} },
        { name: 'mkdocs-redoc-tag', options: {} },
      ],
    });
    const items = needsAttentionPreview(config);
    // All three map to the same ruleId; only one item should appear.
    expect(items.length).toBe(1);
  });
});

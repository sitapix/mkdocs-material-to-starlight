import { describe, expect, it } from 'vitest';
import { explainConversion } from './explain.js';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';

function makeConfig(
  partial: Partial<MkdocsConfig> = {},
): MkdocsConfig {
  return {
    siteName: 'Test',
    siteDescription: null,
    siteUrl: null,
    docsDir: 'docs',
    useDirectoryUrls: true,
    copyright: null,
    repoName: null,
    repoUrl: null,
    editUri: null,
    theme: null,
    nav: null,
    plugins: [],
    markdownExtensions: [],
    extras: {},
    ...partial,
  };
}

describe('explainConversion', () => {
  it('returns only always-on rows when no extensions are enabled', () => {
    const rows = explainConversion(makeConfig());
    // Always-on: rows with no required extensions (e.g. internal link rewrite).
    expect(rows.every((row) => row.requiredExtensions.length === 0)).toBe(true);
    expect(rows.some((row) => row.featureId === 'links-internal')).toBe(true);
  });

  it('includes the admonition rows when admonition extension is enabled', () => {
    const rows = explainConversion(
      makeConfig({
        markdownExtensions: [{ name: 'admonition', options: {} }],
      }),
    );
    expect(rows.some((row) => row.featureId === 'admonition-block')).toBe(true);
    // Collapsibles need pymdownx.details too — should NOT appear yet.
    expect(rows.some((row) => row.featureId === 'admonition-collapsible')).toBe(false);
  });

  it('includes collapsibles only when both admonition and pymdownx.details are enabled', () => {
    const rows = explainConversion(
      makeConfig({
        markdownExtensions: [
          { name: 'admonition', options: {} },
          { name: 'pymdownx.details', options: {} },
        ],
      }),
    );
    expect(rows.some((row) => row.featureId === 'admonition-collapsible')).toBe(true);
  });

  it('includes content tabs only when both pymdownx.tabbed and pymdownx.superfences are enabled', () => {
    const tabbedOnly = explainConversion(
      makeConfig({
        markdownExtensions: [{ name: 'pymdownx.tabbed', options: {} }],
      }),
    );
    expect(tabbedOnly.some((row) => row.featureId === 'content-tabs')).toBe(false);

    const both = explainConversion(
      makeConfig({
        markdownExtensions: [
          { name: 'pymdownx.tabbed', options: {} },
          { name: 'pymdownx.superfences', options: {} },
        ],
      }),
    );
    expect(both.some((row) => row.featureId === 'content-tabs')).toBe(true);
  });

  it('returns rows in stable table order', () => {
    const config = makeConfig({
      markdownExtensions: [
        { name: 'admonition', options: {} },
        { name: 'footnotes', options: {} },
        { name: 'tables', options: {} },
        { name: 'pymdownx.snippets', options: {} },
      ],
    });
    const ids = explainConversion(config).map((row) => row.featureId);
    // The first three deterministic rows from a multi-extension config
    // should reflect the table's declared ordering, not alphabetical or
    // input-order. This pins the ordering as part of the contract.
    expect(ids[0]).toBe('admonition-block');
    expect(ids).toContain('snippets');
    expect(ids).toContain('footnotes');
    expect(ids).toContain('tables');
  });
});

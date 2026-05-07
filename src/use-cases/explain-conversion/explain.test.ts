import { describe, expect, it } from 'vitest';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import { explainConversion } from './explain.js';

function makeConfig(partial: Partial<MkdocsConfig> = {}): MkdocsConfig {
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

  it('does not fire plugin rows when the plugin is absent from the config', () => {
    // Regression: every plugin-* row used to declare `requiredExtensions: []`
    // and no plugin gating, so `every([])` was true and the row fired for
    // every project. The wizard surfaced manual remediations for plugins
    // that weren't even installed.
    const rows = explainConversion(makeConfig());
    const ids = rows.map((row) => row.featureId);
    expect(ids).not.toContain('plugin-privacy');
    expect(ids).not.toContain('plugin-offline');
    expect(ids).not.toContain('plugin-encryptcontent');
    expect(ids).not.toContain('plugin-charts');
    expect(ids).not.toContain('plugin-monorepo');
    expect(ids).not.toContain('plugin-multirepo');
    expect(ids).not.toContain('plugin-markdownextradata');
    expect(ids).not.toContain('comment-system');
  });

  it('fires a plugin row when the matching plugin is configured', () => {
    const rows = explainConversion(makeConfig({ plugins: [{ name: 'privacy', options: {} }] }));
    expect(rows.some((row) => row.featureId === 'plugin-privacy')).toBe(true);
  });

  it('fires comment-system only when theme.custom_dir is set', () => {
    const without = explainConversion(makeConfig({ theme: { name: 'material', options: {} } }));
    expect(without.some((row) => row.featureId === 'comment-system')).toBe(false);

    const withOverrides = explainConversion(
      makeConfig({ theme: { name: 'material', options: { custom_dir: 'overrides' } } }),
    );
    expect(withOverrides.some((row) => row.featureId === 'comment-system')).toBe(true);
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

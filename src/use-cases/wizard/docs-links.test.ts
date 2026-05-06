import { describe, expect, it } from 'vitest';
import {
  tier1DocsUrl,
  pluginDocsUrl,
  TIER1_DOCS,
  PLUGIN_DOCS,
} from './docs-links.js';
import type { Tier1Trigger } from './tier1-trigger.js';

describe('tier1DocsUrl — every Tier 1 trigger has a learn-more URL', () => {
  const triggers: ReadonlyArray<Tier1Trigger> = [
    'tabs',
    'sidebar-topics',
    'snippets',
    'rss',
    'i18n',
    'mike',
    'palette',
    'extra-assets',
  ];

  it.each(triggers)('returns a non-empty https URL for %s', (trigger) => {
    const url = tier1DocsUrl(trigger);
    expect(url).toMatch(/^https?:\/\//);
  });

  it('TIER1_DOCS has an entry for every trigger', () => {
    for (const t of triggers) {
      expect(TIER1_DOCS[t]).toBeDefined();
    }
  });
});

describe('pluginDocsUrl', () => {
  it('returns a docs URL for known unsupported plugins', () => {
    expect(pluginDocsUrl('social')).toMatch(/^https?:\/\//);
    expect(pluginDocsUrl('meta')).toMatch(/^https?:\/\//);
    expect(pluginDocsUrl('mkdocstrings')).toMatch(/^https?:\/\//);
    expect(pluginDocsUrl('mkdocs-jupyter')).toMatch(/^https?:\/\//);
  });

  it('returns null for an unknown plugin name', () => {
    expect(pluginDocsUrl('not-a-real-plugin-xyz')).toBeNull();
  });

  it('every PLUGIN_DOCS entry is a non-empty https URL', () => {
    for (const [name, url] of Object.entries(PLUGIN_DOCS)) {
      expect(url, `entry for ${name}`).toMatch(/^https?:\/\//);
    }
  });
});

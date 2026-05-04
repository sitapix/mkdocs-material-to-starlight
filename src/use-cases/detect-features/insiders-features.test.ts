import { describe, expect, it } from 'vitest';
import { detectInsidersFeatures } from './insiders-features.js';

describe('detectInsidersFeatures', () => {
  it('returns one entry per known Insiders theme.features flag', () => {
    const entries = detectInsidersFeatures({
      themeFeatures: ['navigation.expand', 'navigation.prune'],
      pluginNames: [],
    });
    const flags = entries.map((e) => e.feature);
    expect(flags).toContain('navigation.expand');
    expect(flags).toContain('navigation.prune');
  });

  it('returns one entry per known Insiders plugin', () => {
    const entries = detectInsidersFeatures({
      themeFeatures: [],
      pluginNames: ['meta', 'optimize', 'privacy', 'typeset'],
    });
    const features = entries.map((e) => e.feature);
    expect(features).toContain('meta');
    expect(features).toContain('optimize');
    expect(features).toContain('privacy');
    expect(features).toContain('typeset');
  });

  it('skips theme.features flags that are not Insiders', () => {
    const entries = detectInsidersFeatures({
      themeFeatures: ['navigation.tabs', 'content.code.copy'],
      pluginNames: [],
    });
    expect(entries).toHaveLength(0);
  });

  it('skips plugins that are not Insiders', () => {
    const entries = detectInsidersFeatures({
      themeFeatures: [],
      pluginNames: ['search', 'glightbox', 'mike', 'blog', 'tags'],
    });
    expect(entries).toHaveLength(0);
  });

  it('returns empty for empty input', () => {
    expect(
      detectInsidersFeatures({ themeFeatures: [], pluginNames: [] }),
    ).toHaveLength(0);
  });

  it('each entry carries a non-empty rationale describing the Insiders status', () => {
    const entries = detectInsidersFeatures({
      themeFeatures: ['navigation.expand'],
      pluginNames: ['meta'],
    });
    for (const entry of entries) {
      expect(entry.rationale.length).toBeGreaterThan(10);
      expect(entry.rationale.toLowerCase()).toContain('insiders');
    }
  });

  it('marks the kind correctly (theme-feature vs plugin)', () => {
    const entries = detectInsidersFeatures({
      themeFeatures: ['navigation.expand'],
      pluginNames: ['meta'],
    });
    const themeEntry = entries.find((e) => e.feature === 'navigation.expand');
    const pluginEntry = entries.find((e) => e.feature === 'meta');
    expect(themeEntry?.kind).toBe('theme-feature');
    expect(pluginEntry?.kind).toBe('plugin');
  });

  it('deduplicates when a plugin is configured twice (defensive)', () => {
    const entries = detectInsidersFeatures({
      themeFeatures: [],
      pluginNames: ['meta', 'meta'],
    });
    expect(entries).toHaveLength(1);
  });
});

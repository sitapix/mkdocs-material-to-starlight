import { describe, expect, it } from 'vitest';
import { detectFeaturesFromPlugins } from './from-plugins.js';
import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';

function plugins(...names: string[]): ReadonlyArray<MkdocsPlugin> {
  return names.map((name) => ({ name, options: {} }));
}

describe('detectFeaturesFromPlugins', () => {
  it('returns an empty set when no recognized plugins are configured', () => {
    expect(detectFeaturesFromPlugins(plugins('search', 'unknown-plugin'))).toEqual(
      new Set(),
    );
  });

  it('maps the Material blog plugin to the blog feature', () => {
    expect(detectFeaturesFromPlugins(plugins('blog')).has('blog')).toBe(true);
  });

  it('maps the Material tags plugin to the tags feature', () => {
    expect(detectFeaturesFromPlugins(plugins('tags')).has('tags')).toBe(true);
  });

  it('maps the Material social plugin to the og-cards feature (astro-og-canvas)', () => {
    expect(detectFeaturesFromPlugins(plugins('social')).has('og-cards')).toBe(true);
  });

  it('maps git-revision-date-localized to the last-updated feature', () => {
    expect(
      detectFeaturesFromPlugins(plugins('git-revision-date-localized')).has(
        'last-updated',
      ),
    ).toBe(true);
  });

  it('maps mkdocs-glightbox to the image-zoom feature', () => {
    expect(detectFeaturesFromPlugins(plugins('glightbox')).has('image-zoom')).toBe(
      true,
    );
  });

  it('maps mike to the versions feature', () => {
    expect(detectFeaturesFromPlugins(plugins('mike')).has('versions')).toBe(true);
  });

  it('maps git-authors to the contributor-list feature', () => {
    expect(
      detectFeaturesFromPlugins(plugins('git-authors')).has('contributor-list'),
    ).toBe(true);
  });

  it('maps git-committers to the contributor-list feature', () => {
    expect(
      detectFeaturesFromPlugins(plugins('git-committers')).has('contributor-list'),
    ).toBe(true);
  });

  it('git-authors and git-committers share the same target — both produce a single contributor-list feature', () => {
    const features = detectFeaturesFromPlugins(plugins('git-authors', 'git-committers'));
    expect(features.has('contributor-list')).toBe(true);
    // Set semantics: only one membership for the shared target.
    expect(features.size).toBe(1);
  });

  it('detects multiple recognized plugins in one pass', () => {
    const features = detectFeaturesFromPlugins(plugins('glightbox', 'mike'));
    expect(features.has('image-zoom')).toBe(true);
    expect(features.has('versions')).toBe(true);
  });

  it('ignores unrecognized plugins (no false positives)', () => {
    expect(detectFeaturesFromPlugins(plugins('some-unknown-plugin'))).toEqual(
      new Set(),
    );
  });

  describe('extension-driven features (Tier 4 #14)', () => {
    function exts(...names: string[]): ReadonlyArray<{ readonly name: string }> {
      return names.map((name) => ({ name }));
    }

    it('maps pymdownx.keys to the kbd feature (drives starlight-kbd dep)', () => {
      const features = detectFeaturesFromPlugins([], exts('pymdownx.keys'));
      expect(features.has('kbd')).toBe(true);
    });

    it('does not emit kbd feature when pymdownx.keys is not configured', () => {
      const features = detectFeaturesFromPlugins([], exts('pymdownx.highlight'));
      expect(features.has('kbd')).toBe(false);
    });

    it('combines plugin-driven and extension-driven features in one pass', () => {
      const features = detectFeaturesFromPlugins(
        plugins('mike'),
        exts('pymdownx.keys'),
      );
      expect(features.has('versions')).toBe(true);
      expect(features.has('kbd')).toBe(true);
    });
  });
});

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
});

import { describe, expect, it } from 'vitest';
import { detectFeaturesFromThemeFeatures } from './from-theme-features.js';

describe('detectFeaturesFromThemeFeatures', () => {
  it('maps announce.dismiss to the announcement feature (drives starlight-announcement)', () => {
    const out = detectFeaturesFromThemeFeatures(['announce.dismiss']);
    expect(out.has('announcement')).toBe(true);
  });

  it('maps content.action.view to the page-actions feature (drives starlight-page-actions)', () => {
    const out = detectFeaturesFromThemeFeatures(['content.action.view']);
    expect(out.has('page-actions')).toBe(true);
  });

  it('returns multiple features when both flags are present', () => {
    const out = detectFeaturesFromThemeFeatures(['announce.dismiss', 'content.action.view']);
    expect(out.has('announcement')).toBe(true);
    expect(out.has('page-actions')).toBe(true);
  });

  it('maps navigation.tabs to the sidebar-topics feature (drives starlight-sidebar-topics)', () => {
    // The interface layer filters this out when `--no-sidebar-topics` is set.
    const out = detectFeaturesFromThemeFeatures(['navigation.tabs']);
    expect(out.has('sidebar-topics')).toBe(true);
  });

  it('maps navigation.top to the scroll-to-top feature (drives starlight-scroll-to-top)', () => {
    const out = detectFeaturesFromThemeFeatures(['navigation.top']);
    expect(out.has('scroll-to-top')).toBe(true);
  });

  it('returns empty set when no recognized flags are present', () => {
    expect(detectFeaturesFromThemeFeatures([]).size).toBe(0);
    expect(detectFeaturesFromThemeFeatures(['navigation.footer', 'content.code.copy']).size).toBe(
      0,
    );
  });
});

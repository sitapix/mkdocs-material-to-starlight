import { describe, expect, it } from 'vitest';
import { classifyThemeFeature } from './theme-feature-catalog.js';

describe('classifyThemeFeature', () => {
  it('returns null for an unrecognized feature identifier', () => {
    expect(classifyThemeFeature('not.a.real.feature')).toBeNull();
  });

  it('classifies Starlight-default-on features as replaced-by-default', () => {
    const replaced = [
      'navigation.indexes',
      'navigation.tracking',
      'navigation.sections',
      'navigation.instant',
      'toc.follow',
      'content.code.copy',
      'search.highlight',
      'search.suggest',
    ];
    for (const f of replaced) {
      expect(classifyThemeFeature(f)?.kind).toBe('replaced-by-default');
    }
  });

  it('classifies features with no Starlight equivalent as unsupported', () => {
    const unsupported = [
      'navigation.prune',
      'navigation.top',
      'toc.integrate',
      'header.autohide',
      'content.action.view',
      'announce.dismiss',
      'search.share',
      'navigation.expand',
    ];
    for (const f of unsupported) {
      expect(classifyThemeFeature(f)?.kind).toBe('unsupported');
    }
  });

  it('marks features handled by other dedicated emitters as handled-elsewhere', () => {
    // These already have their own ad-hoc diagnostics or are derived from
    // other config keys (repo_url+edit_uri); the umbrella classifier should
    // skip them so we do not double-emit.
    const handled = ['navigation.tabs', 'content.tabs.link', 'content.action.edit'];
    for (const f of handled) {
      expect(classifyThemeFeature(f)?.kind).toBe('handled-elsewhere');
    }
  });

  it('returns a non-empty note for every classified feature', () => {
    for (const f of [
      'navigation.tabs',
      'navigation.prune',
      'toc.follow',
      'content.code.copy',
    ]) {
      const result = classifyThemeFeature(f);
      expect(result).not.toBeNull();
      expect(result?.note.length).toBeGreaterThan(0);
    }
  });
});

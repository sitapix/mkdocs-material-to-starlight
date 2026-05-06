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
    for (const f of ['navigation.tabs', 'navigation.prune', 'toc.follow', 'content.code.copy']) {
      const result = classifyThemeFeature(f);
      expect(result).not.toBeNull();
      expect(result?.note.length).toBeGreaterThan(0);
    }
  });

  it('classifies Material 9.7 footnote tooltips as unsupported', () => {
    // Material 9.7 added hover-tooltips for `[^1]` footnote references; no
    // Starlight equivalent. Users wanting parity must build a custom MDX
    // component or footnote-popover script. Flag name verified against the
    // Material docs: SINGULAR `footnote`, not `footnotes`.
    const result = classifyThemeFeature('content.footnote.tooltips');
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('unsupported');
    expect(result?.note).toMatch(/footnote/i);
  });

  it('does NOT register navigation.alternate (Material 9.7 stay-on-page is automatic)', () => {
    // Verified against Material docs and issue #4835: stay-on-page when
    // switching languages is built-in to 9.7+ and requires no theme.features
    // flag. The behaviour activates whenever `extra.alternate:` is configured
    // in mkdocs.yml. We deliberately do NOT register a synthetic
    // `navigation.alternate` entry — that flag does not exist, and pretending
    // it does would mislead users grepping diagnostics.
    expect(classifyThemeFeature('navigation.alternate')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { detectLongtailFeatures } from './theme-features-longtail.js';

/**
 * Long-tail flags that are NOT in the primary theme-feature-catalog.ts and
 * thus will be returned by detectLongtailFeatures:
 *   - navigation.instant.preview  (catalog has navigation.instant.prefetch, not preview)
 *   - navigation.sections.expand  (not in catalog)
 *
 * All other flags listed in the spec's LONGTAIL table are already in the
 * primary catalog and will be skipped (e.g., content.footnote.tooltips
 * has a richer note in the primary catalog and is filtered out here).
 */

describe('detectLongtailFeatures', () => {
  it('returns entries for flags that are in LONGTAIL but NOT in the primary catalog', () => {
    const flags = [
      'navigation.instant.preview',
      'navigation.sections.expand',
    ];
    const entries = detectLongtailFeatures(flags);
    const flagNames = entries.map((e) => e.flag);
    expect(flagNames).toContain('navigation.instant.preview');
    expect(flagNames).toContain('navigation.sections.expand');
  });

  it('excludes flags already handled by the primary classifier', () => {
    // All of these are in the primary catalog (handled-elsewhere, replaced-by-default,
    // or unsupported) and must NOT produce longtail entries.
    const flags = [
      'navigation.tabs',       // handled-elsewhere
      'content.code.copy',     // replaced-by-default
      'navigation.top',        // unsupported
      'toc.integrate',         // unsupported
      'navigation.instant',    // replaced-by-default
      'announce.dismiss',      // unsupported
      'header.autohide',       // unsupported
      'content.action.view',   // unsupported
      'content.tooltips',      // unsupported
      'content.code.select',   // replaced-by-default
    ];
    const entries = detectLongtailFeatures(flags);
    expect(entries).toHaveLength(0);
  });

  it('returns empty array when no long-tail flags are present', () => {
    expect(detectLongtailFeatures(['navigation.tabs', 'content.code.copy'])).toHaveLength(0);
  });

  it('returns empty array for an empty features list', () => {
    expect(detectLongtailFeatures([])).toHaveLength(0);
  });

  it('excludes unknown flags (not in either catalog)', () => {
    const entries = detectLongtailFeatures(['some.unknown.feature.v99']);
    expect(entries).toHaveLength(0);
  });

  it('each detected entry has a non-empty recommendation string', () => {
    const entries = detectLongtailFeatures([
      'navigation.sections.expand',
      'navigation.instant.preview',
    ]);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.recommendation.length).toBeGreaterThan(10);
    }
  });

  it('handles navigation.instant.preview with prefetch recommendation', () => {
    const entries = detectLongtailFeatures(['navigation.instant.preview']);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.flag).toBe('navigation.instant.preview');
    expect(entries[0]?.recommendation).toContain('prefetch');
  });

  it('returns only longtail flags when mixed with primary-catalog and unknown flags', () => {
    const flags = [
      'navigation.instant.preview',   // longtail — not in primary catalog
      'navigation.sections.expand',   // longtail — not in primary catalog
      'navigation.tabs',              // handled-elsewhere → excluded
      'content.code.copy',            // replaced-by-default → excluded
      'navigation.top',               // unsupported in primary catalog → excluded
      'totally.unknown.flag',         // not in any catalog → excluded
      'content.footnote.tooltips',    // primary catalog (rich note) → excluded
      'navigation.instant',           // replaced-by-default in primary → excluded
    ];
    const entries = detectLongtailFeatures(flags);
    const flagNames = entries.map((e) => e.flag);
    expect(flagNames).toContain('navigation.instant.preview');
    expect(flagNames).toContain('navigation.sections.expand');
    expect(flagNames).not.toContain('navigation.tabs');
    expect(flagNames).not.toContain('content.code.copy');
    expect(flagNames).not.toContain('navigation.top');
    expect(flagNames).not.toContain('totally.unknown.flag');
    expect(flagNames).not.toContain('navigation.instant');
    expect(flagNames).not.toContain('content.footnote.tooltips');
  });
});

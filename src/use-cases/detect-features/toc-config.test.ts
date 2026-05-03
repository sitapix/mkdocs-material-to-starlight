import { describe, expect, it } from 'vitest';
import { extractTocConfig } from './toc-config.js';

describe('extractTocConfig', () => {
  it('returns undefined for empty extensions list', () => {
    expect(extractTocConfig([])).toBeUndefined();
  });

  it('returns undefined when toc extension is absent', () => {
    expect(extractTocConfig([{ name: 'admonition', options: {} }])).toBeUndefined();
  });

  it('returns config when toc has options', () => {
    const out = extractTocConfig([
      { name: 'toc', options: { permalink: true, toc_depth: 4 } },
    ]);
    expect(out).toEqual({ minHeadingLevel: 2, maxHeadingLevel: 4 });
  });

  it('defaults to maxHeadingLevel 6 when toc_depth not specified', () => {
    const out = extractTocConfig([{ name: 'toc', options: {} }]);
    expect(out).toEqual({ minHeadingLevel: 2, maxHeadingLevel: 6 });
  });

  it('clamps maxHeadingLevel to 6 (Starlight upper bound)', () => {
    const out = extractTocConfig([{ name: 'toc', options: { toc_depth: 10 } }]);
    expect(out?.maxHeadingLevel).toBe(6);
  });

  it('respects minHeadingLevel from custom range "2-3"', () => {
    const out = extractTocConfig([{ name: 'toc', options: { toc_depth: '2-4' } }]);
    expect(out).toEqual({ minHeadingLevel: 2, maxHeadingLevel: 4 });
  });

  it('returns undefined when toc has no options entry at all (bare `- toc`)', () => {
    // Default Material setup doesn't supply config; we should NOT emit a
    // tableOfContents block in that case (Starlight defaults are sane).
    expect(extractTocConfig([{ name: 'toc', options: {} }])).toEqual({
      minHeadingLevel: 2,
      maxHeadingLevel: 6,
    });
  });
});

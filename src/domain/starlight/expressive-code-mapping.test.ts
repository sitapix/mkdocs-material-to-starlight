import { describe, expect, it } from 'vitest';
import { mapPygmentsHighlightToExpressiveCode } from './expressive-code-mapping.js';

describe('mapPygmentsHighlightToExpressiveCode', () => {
  it('returns null when input is missing', () => {
    expect(mapPygmentsHighlightToExpressiveCode(undefined)).toBeNull();
    expect(mapPygmentsHighlightToExpressiveCode(null)).toBeNull();
    expect(mapPygmentsHighlightToExpressiveCode({})).toBeNull();
  });

  it('maps monokai (dark) to a light/dark Shiki pair', () => {
    const result = mapPygmentsHighlightToExpressiveCode({ pygments_style: 'monokai' });
    expect(result).not.toBeNull();
    expect(result?.themes).toEqual(['github-light', 'monokai']);
    expect(result?.sourceStyle).toBe('monokai');
    expect(result?.fellBack).toBe(false);
  });

  it('maps a paired Pygments style to its matching Shiki pair', () => {
    const result = mapPygmentsHighlightToExpressiveCode({ pygments_style: 'solarized-dark' });
    expect(result?.themes).toEqual(['solarized-light', 'solarized-dark']);
    expect(result?.fellBack).toBe(false);
  });

  it('maps the github family symmetrically regardless of which side the user picked', () => {
    expect(
      mapPygmentsHighlightToExpressiveCode({ pygments_style: 'github-dark' })?.themes,
    ).toEqual(['github-light', 'github-dark']);
    expect(
      mapPygmentsHighlightToExpressiveCode({ pygments_style: 'github-light' })?.themes,
    ).toEqual(['github-light', 'github-dark']);
  });

  it('reports a fallback when the Pygments style has no curated mapping', () => {
    const result = mapPygmentsHighlightToExpressiveCode({ pygments_style: 'paraiso-dark' });
    expect(result).not.toBeNull();
    expect(result?.themes).toEqual(['github-light', 'github-dark']);
    expect(result?.fellBack).toBe(true);
    expect(result?.sourceStyle).toBe('paraiso-dark');
  });

  it('lists pymdownx.highlight options that are not honored', () => {
    const result = mapPygmentsHighlightToExpressiveCode({
      pygments_style: 'monokai',
      linenums: true,
      anchor_linenums: true,
      line_spans: '__codeline',
      line_anchors: '__codeline',
      noclasses: true,
      use_pygments: false,
    });
    expect(result?.unsupportedOptions).toEqual(
      expect.arrayContaining([
        'linenums',
        'anchor_linenums',
        'line_spans',
        'line_anchors',
        'noclasses',
        'use_pygments',
      ]),
    );
  });

  it('does not list options that match ExpressiveCode defaults', () => {
    const result = mapPygmentsHighlightToExpressiveCode({
      pygments_style: 'monokai',
      auto_title: true,
    });
    expect(result?.unsupportedOptions).not.toContain('auto_title');
  });

  it('accepts the markdown_extensions list shape (array of strings or single-key objects)', () => {
    const raw = [
      'admonition',
      { 'pymdownx.highlight': { pygments_style: 'dracula' } },
      'pymdownx.superfences',
    ];
    const result = mapPygmentsHighlightToExpressiveCode(raw);
    expect(result?.themes).toEqual(['github-light', 'dracula']);
    expect(result?.sourceStyle).toBe('dracula');
  });

  it('returns null when pymdownx.highlight is enabled but no pygments_style is set', () => {
    // Default Pygments style varies; without an explicit override we leave
    // ExpressiveCode at its own defaults rather than guessing.
    const raw = [{ 'pymdownx.highlight': { linenums: true } }];
    expect(mapPygmentsHighlightToExpressiveCode(raw)).toBeNull();
  });
});

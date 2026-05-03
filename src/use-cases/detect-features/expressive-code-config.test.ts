import { describe, expect, it } from 'vitest';
import { extractExpressiveCodeConfig } from './expressive-code-config.js';

describe('extractExpressiveCodeConfig', () => {
  it('returns undefined when pymdownx.highlight is absent', () => {
    expect(extractExpressiveCodeConfig([])).toBeUndefined();
    expect(
      extractExpressiveCodeConfig([{ name: 'admonition', options: {} }]),
    ).toBeUndefined();
  });

  it('returns undefined when pymdownx.highlight is present but pygments_style is not set', () => {
    expect(
      extractExpressiveCodeConfig([
        { name: 'pymdownx.highlight', options: { linenums: true } },
      ]),
    ).toBeUndefined();
  });

  it('returns the curated theme pair when pygments_style is recognized', () => {
    const out = extractExpressiveCodeConfig([
      { name: 'pymdownx.highlight', options: { pygments_style: 'monokai' } },
    ]);
    expect(out?.themes).toEqual(['github-light', 'monokai']);
    expect(out?.sourceStyle).toBe('monokai');
    expect(out?.fellBack).toBe(false);
  });

  it('marks the result as a fallback when pygments_style is not in the curated map', () => {
    const out = extractExpressiveCodeConfig([
      { name: 'pymdownx.highlight', options: { pygments_style: 'paraiso-dark' } },
    ]);
    expect(out?.fellBack).toBe(true);
    expect(out?.themes).toEqual(['github-light', 'github-dark']);
  });

  it('reports unsupported pymdownx.highlight options', () => {
    const out = extractExpressiveCodeConfig([
      {
        name: 'pymdownx.highlight',
        options: {
          pygments_style: 'monokai',
          linenums: true,
          anchor_linenums: true,
          noclasses: true,
        },
      },
    ]);
    expect(out?.unsupportedOptions).toEqual(
      expect.arrayContaining(['linenums', 'anchor_linenums', 'noclasses']),
    );
  });
});

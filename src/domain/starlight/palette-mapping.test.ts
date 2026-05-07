import { describe, expect, it } from 'vitest';
import { mapMaterialPaletteToStarlight, type StarlightPalette } from './palette-mapping.js';

describe('mapMaterialPaletteToStarlight', () => {
  it('returns null for an empty/missing palette', () => {
    expect(mapMaterialPaletteToStarlight({})).toBeNull();
    expect(mapMaterialPaletteToStarlight(null)).toBeNull();
  });

  it('maps a known primary color to a Starlight accent hue', () => {
    const result = mapMaterialPaletteToStarlight({ primary: 'pink' });
    expect(result).not.toBeNull();
    expect(result?.accentHue).toBeGreaterThanOrEqual(0);
    expect(result?.accentHue).toBeLessThan(360);
  });

  it('returns "custom" sentinel for primary: custom (caller emits diagnostic)', () => {
    const result = mapMaterialPaletteToStarlight({ primary: 'custom' });
    expect(result?.isCustom).toBe(true);
  });

  it('returns null for an unknown color name', () => {
    expect(mapMaterialPaletteToStarlight({ primary: 'plaid' })).toBeNull();
  });

  it('handles all 21 Material primary colors without throwing', () => {
    const colors = [
      'red',
      'pink',
      'purple',
      'deep purple',
      'indigo',
      'blue',
      'light blue',
      'cyan',
      'teal',
      'green',
      'light green',
      'lime',
      'yellow',
      'amber',
      'orange',
      'deep orange',
      'brown',
      'grey',
      'blue grey',
      'black',
      'white',
    ];
    for (const c of colors) {
      const r = mapMaterialPaletteToStarlight({ primary: c });
      expect(r).not.toBeNull();
    }
  });

  it('accepts a palette array (multi-toggle) and uses the first scheme', () => {
    const palette = [
      {
        media: '(prefers-color-scheme: light)',
        scheme: 'default',
        primary: 'pink',
        accent: 'pink',
      },
      { media: '(prefers-color-scheme: dark)', scheme: 'slate', primary: 'pink', accent: 'pink' },
    ];
    const result = mapMaterialPaletteToStarlight(palette);
    expect(result).not.toBeNull();
  });

  it('extracts the slate scheme separately as a dark-mode override', () => {
    const palette = [
      { media: '(prefers-color-scheme: light)', scheme: 'default', primary: 'indigo' },
      { media: '(prefers-color-scheme: dark)', scheme: 'slate', primary: 'amber' },
    ];
    const result = mapMaterialPaletteToStarlight(palette);
    expect(result?.sourceName).toBe('indigo');
    expect(result?.darkAccentHue).toBe(75); // amber
    expect(result?.darkAccentChroma).toBe(0.18);
    expect(result?.darkSourceName).toBe('amber');
  });

  it('omits the dark override when there is no slate scheme', () => {
    const result = mapMaterialPaletteToStarlight({ primary: 'pink' });
    expect(result?.darkAccentHue).toBeUndefined();
    expect(result?.darkAccentChroma).toBeUndefined();
    expect(result?.darkSourceName).toBeUndefined();
  });

  it('omits the dark override when slate scheme has an unknown color', () => {
    const palette = [
      { scheme: 'default', primary: 'indigo' },
      { scheme: 'slate', primary: 'plaid' },
    ];
    const result = mapMaterialPaletteToStarlight(palette);
    expect(result?.sourceName).toBe('indigo');
    expect(result?.darkAccentHue).toBeUndefined();
  });

  it('accepts dict shorthand { primary: pink, accent: pink }', () => {
    const result = mapMaterialPaletteToStarlight({ primary: 'pink', accent: 'pink' });
    expect(result?.accentHue).toBeDefined();
  });
});

describe('StarlightPalette shape', () => {
  it('has accentHue, accentChroma, isCustom fields', () => {
    const result = mapMaterialPaletteToStarlight({ primary: 'blue' });
    const expected: StarlightPalette = result as StarlightPalette;
    expect(typeof expected.accentHue).toBe('number');
    expect(typeof expected.accentChroma).toBe('number');
    expect(typeof expected.isCustom).toBe('boolean');
  });
});

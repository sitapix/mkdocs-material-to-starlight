import { describe, expect, it } from 'vitest';
import { mapMaterialFontsToFontsource } from './font-mapping.js';

describe('mapMaterialFontsToFontsource', () => {
  it('returns null when neither text nor code is configured', () => {
    expect(mapMaterialFontsToFontsource({})).toBeNull();
    expect(mapMaterialFontsToFontsource(null)).toBeNull();
    expect(mapMaterialFontsToFontsource(undefined)).toBeNull();
  });

  it('returns null when theme.font is false (Google Fonts disabled)', () => {
    expect(mapMaterialFontsToFontsource(false)).toBeNull();
  });

  it('maps a single-word family to a kebab-case Fontsource package', () => {
    const result = mapMaterialFontsToFontsource({ text: 'Roboto' });
    expect(result?.text).toEqual({ family: 'Roboto', package: '@fontsource/roboto' });
    expect(result?.code).toBeUndefined();
  });

  it('maps a multi-word family with hyphenated package name', () => {
    const result = mapMaterialFontsToFontsource({
      text: 'Source Sans Pro',
      code: 'JetBrains Mono',
    });
    expect(result?.text?.package).toBe('@fontsource/source-sans-pro');
    expect(result?.code?.package).toBe('@fontsource/jetbrains-mono');
  });

  it('preserves original casing for the CSS family', () => {
    const result = mapMaterialFontsToFontsource({ text: 'Roboto Mono' });
    expect(result?.text?.family).toBe('Roboto Mono');
  });

  it('omits text when only code is configured (and vice versa)', () => {
    expect(mapMaterialFontsToFontsource({ code: 'Fira Code' })?.text).toBeUndefined();
    expect(mapMaterialFontsToFontsource({ text: 'Inter' })?.code).toBeUndefined();
  });

  it('rejects family names with characters Fontsource does not accept', () => {
    // Fontsource package names must be ASCII letters/digits/hyphens.
    expect(mapMaterialFontsToFontsource({ text: '日本語' })).toBeNull();
    expect(mapMaterialFontsToFontsource({ text: 'Foo!Bar' })).toBeNull();
  });

  it('strips redundant whitespace in family names', () => {
    const result = mapMaterialFontsToFontsource({ text: '  Open  Sans  ' });
    expect(result?.text?.family).toBe('Open Sans');
    expect(result?.text?.package).toBe('@fontsource/open-sans');
  });
});

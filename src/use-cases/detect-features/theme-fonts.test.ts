import { describe, expect, it } from 'vitest';
import { extractThemeFonts } from './theme-fonts.js';

describe('extractThemeFonts', () => {
  it('returns undefined when theme has no font block', () => {
    expect(extractThemeFonts({})).toBeUndefined();
    expect(extractThemeFonts({ name: 'material' })).toBeUndefined();
  });

  it('returns the converter shape when theme.font.{text,code} is set', () => {
    const result = extractThemeFonts({
      font: { text: 'Roboto', code: 'Roboto Mono' },
    });
    expect(result?.text?.package).toBe('@fontsource/roboto');
    expect(result?.code?.package).toBe('@fontsource/roboto-mono');
  });

  it('returns undefined when theme.font is false', () => {
    expect(extractThemeFonts({ font: false })).toBeUndefined();
  });
});

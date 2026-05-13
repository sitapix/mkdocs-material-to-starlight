import { describe, expect, it } from 'vitest';
import { diagnoseThemeFonts } from './diagnose-theme-fonts.js';

describe('diagnoseThemeFonts', () => {
  it('returns no diagnostics when theme.font is absent', () => {
    expect(diagnoseThemeFonts(undefined)).toEqual([]);
  });

  it('emits theme-fonts-applied with the resolved Fontsource packages', () => {
    const result = diagnoseThemeFonts({
      text: { package: '@fontsource-variable/inter' },
    });
    expect(result).toHaveLength(1);
    const message = result[0]!.diagnostic.message;
    expect(message).toContain('@fontsource-variable/inter');
  });

  it('includes the Starlight default-font disclaimer so users see they are opting out of the local-fonts default', () => {
    const result = diagnoseThemeFonts({
      text: { package: '@fontsource-variable/inter' },
      code: { package: '@fontsource-variable/jetbrains-mono' },
    });
    const message = result[0]!.diagnostic.message;
    expect(message).toMatch(/sans-serif fonts available on a user'?s local device/i);
    expect(message).toMatch(/custom CSS|other Astro styling/i);
  });
});

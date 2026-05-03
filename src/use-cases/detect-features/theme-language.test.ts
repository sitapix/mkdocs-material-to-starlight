import { describe, expect, it } from 'vitest';
import { extractThemeLanguage } from './theme-language.js';

describe('extractThemeLanguage', () => {
  it('returns undefined when theme options are empty or language is missing', () => {
    expect(extractThemeLanguage({})).toBeUndefined();
    expect(extractThemeLanguage({ name: 'material' })).toBeUndefined();
  });

  it('returns undefined when language is the Material default "en"', () => {
    // Starlight defaults to English UI strings; emitting locales for "en"
    // would only add noise.
    expect(extractThemeLanguage({ language: 'en' })).toBeUndefined();
  });

  it('returns code+label for a known short locale', () => {
    expect(extractThemeLanguage({ language: 'de' })).toEqual({
      code: 'de',
      label: 'Deutsch',
    });
    expect(extractThemeLanguage({ language: 'fr' })).toEqual({
      code: 'fr',
      label: 'Français',
    });
    expect(extractThemeLanguage({ language: 'ja' })).toEqual({
      code: 'ja',
      label: '日本語',
    });
  });

  it('preserves regional variants (BCP-47 lowercased)', () => {
    expect(extractThemeLanguage({ language: 'pt-BR' })).toEqual({
      code: 'pt-BR',
      label: 'Português (Brasil)',
    });
    expect(extractThemeLanguage({ language: 'zh-Hans' })).toEqual({
      code: 'zh-Hans',
      label: '简体中文',
    });
  });

  it('falls back to the code itself for unknown locales', () => {
    expect(extractThemeLanguage({ language: 'xx' })).toEqual({
      code: 'xx',
      label: 'xx',
    });
  });

  it('returns undefined when language is not a string', () => {
    expect(extractThemeLanguage({ language: 42 })).toBeUndefined();
    expect(extractThemeLanguage({ language: null })).toBeUndefined();
  });
});

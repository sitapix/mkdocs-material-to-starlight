import { describe, expect, it } from 'vitest';
import { extractI18nLocales, extractI18nConfig } from './i18n-config.js';
import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';

describe('extractI18nLocales', () => {
  it('returns an empty list when no i18n plugin is configured', () => {
    expect(extractI18nLocales([])).toEqual([]);
    expect(extractI18nLocales([{ name: 'search', options: {} }])).toEqual([]);
  });

  it('returns the non-default locale codes from the i18n plugin', () => {
    const plugin: MkdocsPlugin = {
      name: 'i18n',
      options: {
        languages: [
          { locale: 'en', default: true, name: 'English' },
          { locale: 'fr', name: 'Français' },
          { locale: 'de', name: 'Deutsch' },
        ],
      },
    };
    expect(extractI18nLocales([plugin])).toEqual(['fr', 'de']);
  });

  it('treats the first language as default when no `default: true` is set', () => {
    const plugin: MkdocsPlugin = {
      name: 'i18n',
      options: {
        languages: [
          { locale: 'en' },
          { locale: 'fr' },
        ],
      },
    };
    expect(extractI18nLocales([plugin])).toEqual(['fr']);
  });

  it('handles regional locale codes (zh-CN, pt-BR)', () => {
    const plugin: MkdocsPlugin = {
      name: 'i18n',
      options: {
        languages: [
          { locale: 'en', default: true },
          { locale: 'zh-CN' },
          { locale: 'pt-BR' },
        ],
      },
    };
    expect(extractI18nLocales([plugin])).toEqual(['zh-CN', 'pt-BR']);
  });

  it('returns empty for malformed languages config (no `locale` keys)', () => {
    const plugin: MkdocsPlugin = {
      name: 'i18n',
      options: { languages: [{ name: 'English' }] },
    };
    expect(extractI18nLocales([plugin])).toEqual([]);
  });

  it('returns empty when languages is missing entirely', () => {
    expect(
      extractI18nLocales([{ name: 'i18n', options: {} }]),
    ).toEqual([]);
  });
});

describe('extractI18nConfig', () => {
  it('returns null when no i18n plugin is configured', () => {
    expect(extractI18nConfig([])).toBeNull();
    expect(extractI18nConfig([{ name: 'search', options: {} }])).toBeNull();
  });

  it('returns null when the i18n plugin has no languages array', () => {
    expect(extractI18nConfig([{ name: 'i18n', options: {} }])).toBeNull();
  });

  it('returns the full locale config with names and default flag', () => {
    const out = extractI18nConfig([
      {
        name: 'i18n',
        options: {
          languages: [
            { locale: 'en', default: true, name: 'English' },
            { locale: 'fr', name: 'Français' },
            { locale: 'de', name: 'Deutsch' },
          ],
        },
      },
    ]);
    expect(out).toEqual({
      defaultLocale: 'en',
      locales: [
        { code: 'en', label: 'English', isDefault: true },
        { code: 'fr', label: 'Français', isDefault: false },
        { code: 'de', label: 'Deutsch', isDefault: false },
      ],
    });
  });

  it('falls back to the locale code as label when name is missing', () => {
    const out = extractI18nConfig([
      {
        name: 'i18n',
        options: {
          languages: [
            { locale: 'en', default: true },
            { locale: 'fr' },
          ],
        },
      },
    ]);
    expect(out?.locales[1]?.label).toBe('fr');
  });

  it('treats the first entry as default when no explicit default is set', () => {
    const out = extractI18nConfig([
      {
        name: 'i18n',
        options: {
          languages: [
            { locale: 'en', name: 'English' },
            { locale: 'fr', name: 'Français' },
          ],
        },
      },
    ]);
    expect(out?.defaultLocale).toBe('en');
    expect(out?.locales[0]?.isDefault).toBe(true);
  });
});

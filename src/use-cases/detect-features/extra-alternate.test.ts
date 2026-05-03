import { describe, expect, it } from 'vitest';
import { extractAlternateLocales } from './extra-alternate.js';

describe('extractAlternateLocales', () => {
  it('returns null when extras has no alternate', () => {
    expect(extractAlternateLocales({})).toBeNull();
  });

  it('returns null when alternate is not an array', () => {
    expect(extractAlternateLocales({ alternate: 'invalid' })).toBeNull();
  });

  it('parses extra.alternate entries and infers default from the first', () => {
    const out = extractAlternateLocales({
      alternate: [
        { name: 'en - English', link: '/', lang: 'en' },
        { name: 'fr - Français', link: '/fr/', lang: 'fr' },
      ],
    });
    expect(out).toEqual({
      defaultLocale: 'en',
      locales: [
        { code: 'en', label: 'English', isDefault: true },
        { code: 'fr', label: 'Français', isDefault: false },
      ],
    });
  });

  it('handles emoji-flag names (Ultralytics pattern)', () => {
    const out = extractAlternateLocales({
      alternate: [
        { name: '🇬🇧 English', link: '/', lang: 'en' },
        { name: '🇨🇳 简体中文', link: '/zh/', lang: 'zh' },
      ],
    });
    expect(out?.locales[0]?.label).toContain('English');
    expect(out?.locales[1]?.label).toContain('简体中文');
  });

  it('returns null when no alternate entry has lang', () => {
    expect(
      extractAlternateLocales({ alternate: [{ name: 'X', link: '/' }] }),
    ).toBeNull();
  });

  it('uses link "/" presence as default-locale signal when explicit default missing', () => {
    const out = extractAlternateLocales({
      alternate: [
        { name: 'fr - Français', link: '/fr/', lang: 'fr' },
        { name: 'en - English', link: '/', lang: 'en' },
      ],
    });
    expect(out?.defaultLocale).toBe('en');
  });

  it('strips "code - " prefix from labels for cleaner display', () => {
    const out = extractAlternateLocales({
      alternate: [
        { name: 'en - English', link: '/', lang: 'en' },
        { name: 'fr - Français', link: '/fr/', lang: 'fr' },
      ],
    });
    expect(out?.locales[0]?.label).toBe('English');
    expect(out?.locales[1]?.label).toBe('Français');
  });
});

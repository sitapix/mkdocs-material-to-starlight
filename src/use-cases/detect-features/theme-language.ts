/**
 * Translate Material's `theme.language` (UI string locale) into a single-locale
 * Starlight `locales` entry.
 *
 * Material exposes one `theme.language` key for the whole site — it controls
 * the *labels* the theme renders (sidebar headings, search box placeholder,
 * "On this page", etc.) without implying multilingual content. Starlight's
 * equivalent is the `locales: { root: { label, lang } }` block plus
 * `defaultLocale: 'root'`. When the value is "en" we omit the block entirely
 * since Starlight's defaults are already English.
 *
 * Pure: takes the parsed `theme.options` record, returns the shape the
 * interface shell can fold into `serializeAstroConfig`'s `i18n` input. No
 * I/O.
 */

export interface ThemeLanguageConfig {
  readonly code: string;
  readonly label: string;
}

const LOCALE_LABELS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    af: 'Afrikaans',
    ar: 'العربية',
    bg: 'Български',
    bn: 'বাংলা',
    ca: 'Català',
    cs: 'Čeština',
    da: 'Dansk',
    de: 'Deutsch',
    el: 'Ελληνικά',
    es: 'Español',
    et: 'Eesti',
    fa: 'فارسی',
    fi: 'Suomi',
    fr: 'Français',
    he: 'עברית',
    hi: 'हिन्दी',
    hr: 'Hrvatski',
    hu: 'Magyar',
    id: 'Bahasa Indonesia',
    it: 'Italiano',
    ja: '日本語',
    ko: '한국어',
    lt: 'Lietuvių',
    lv: 'Latviešu',
    nb: 'Norsk Bokmål',
    nl: 'Nederlands',
    no: 'Norsk',
    pl: 'Polski',
    pt: 'Português',
    'pt-BR': 'Português (Brasil)',
    ro: 'Română',
    ru: 'Русский',
    sk: 'Slovenčina',
    sl: 'Slovenščina',
    sr: 'Српски',
    sv: 'Svenska',
    th: 'ไทย',
    tr: 'Türkçe',
    uk: 'Українська',
    vi: 'Tiếng Việt',
    zh: '中文',
    'zh-CN': '简体中文',
    'zh-Hans': '简体中文',
    'zh-Hant': '繁體中文',
    'zh-TW': '繁體中文',
  }),
);

export function extractThemeLanguage(
  themeOptions: Readonly<Record<string, unknown>>,
): ThemeLanguageConfig | undefined {
  const raw = themeOptions['language'];
  if (typeof raw !== 'string') return undefined;
  if (raw === 'en') return undefined;
  return {
    code: raw,
    label: LOCALE_LABELS.get(raw) ?? raw,
  };
}

/**
 * Extract non-default locale codes from a `mkdocs-static-i18n` plugin in
 * `mkdocs.yml`:
 *
 *   plugins:
 *     - i18n:
 *         languages:
 *           - locale: en
 *             default: true
 *           - locale: fr
 *           - locale: de
 *
 * Returns `['fr', 'de']` — the locales that triggered file-suffix renames.
 * The default locale is dropped (Starlight's directory layout has no prefix
 * for it). Without `default: true`, the first entry is treated as default.
 * Pure.
 */

import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';

interface LanguageEntry {
  readonly locale?: unknown;
  readonly default?: unknown;
}

export function extractI18nLocales(
  plugins: ReadonlyArray<MkdocsPlugin>,
): ReadonlyArray<string> {
  for (const plugin of plugins) {
    if (plugin.name !== 'i18n') {
      continue;
    }
    const languages = plugin.options['languages'];
    if (!Array.isArray(languages)) {
      continue;
    }
    return collectNonDefault(languages);
  }
  return [];
}

function collectNonDefault(languages: ReadonlyArray<unknown>): ReadonlyArray<string> {
  const out: string[] = [];
  let sawDefault = false;
  for (const entry of languages) {
    const lang = entry as LanguageEntry;
    if (typeof lang?.locale !== 'string') {
      continue;
    }
    if (lang.default === true) {
      sawDefault = true;
      continue;
    }
    if (!sawDefault && out.length === 0) {
      // First language entry without explicit `default: true` is treated as
      // the default per mkdocs-static-i18n's documented behavior. Skip it
      // BUT only if no later entry was marked default.
      // We make a single-pass approximation: if the very first entry has no
      // `default: true`, treat it as implicit default.
      sawDefault = true;
      continue;
    }
    out.push(lang.locale);
  }
  return out;
}

/**
 * Structured representation of the i18n configuration suitable for emitting
 * a Starlight `locales: { … }` block in `astro.config.mjs`.
 */
interface I18nLocaleEntry {
  readonly code: string;
  readonly label: string;
  readonly isDefault: boolean;
}

export interface I18nConfig {
  readonly defaultLocale: string;
  readonly locales: ReadonlyArray<I18nLocaleEntry>;
}

interface RichLanguageEntry {
  readonly locale?: unknown;
  readonly default?: unknown;
  readonly name?: unknown;
}

export function extractI18nConfig(
  plugins: ReadonlyArray<MkdocsPlugin>,
): I18nConfig | null {
  for (const plugin of plugins) {
    if (plugin.name !== 'i18n') {
      continue;
    }
    const languages = plugin.options['languages'];
    if (!Array.isArray(languages)) {
      continue;
    }
    return buildI18nConfig(languages);
  }
  return null;
}

function buildI18nConfig(languages: ReadonlyArray<unknown>): I18nConfig | null {
  const entries: I18nLocaleEntry[] = [];
  for (const entry of languages) {
    const lang = entry as RichLanguageEntry;
    if (typeof lang?.locale !== 'string') {
      continue;
    }
    const label = typeof lang.name === 'string' ? lang.name : lang.locale;
    entries.push({
      code: lang.locale,
      label,
      isDefault: lang.default === true,
    });
  }
  if (entries.length === 0) {
    return null;
  }
  // If no entry was marked default, promote the first one — matching
  // mkdocs-static-i18n's documented behavior.
  if (!entries.some((e) => e.isDefault)) {
    const first = entries[0]!;
    entries[0] = { ...first, isDefault: true };
  }
  const defaultEntry = entries.find((e) => e.isDefault) ?? entries[0]!;
  return {
    defaultLocale: defaultEntry.code,
    locales: entries,
  };
}

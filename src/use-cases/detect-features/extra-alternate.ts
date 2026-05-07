/**
 * Extract Starlight `locales: { … }` config from MkDocs `extra.alternate[]`.
 *
 * `extra.alternate` is a manual language switcher used by sites with
 * per-language directories outside `mkdocs-static-i18n` (Tiangolo's
 * FastAPI/Typer template, Ultralytics):
 *
 *   extra:
 *     alternate:
 *       - { name: 'en - English', link: '/',    lang: en }
 *       - { name: 'fr - Français', link: '/fr/', lang: fr }
 *
 * The default locale comes from `default: true` on an entry (rare) or the
 * entry whose `link` is `/`. Pure; returns null when extras have no
 * usable alternate config.
 */

export interface AlternateLocaleConfig {
  readonly defaultLocale: string;
  readonly locales: ReadonlyArray<{
    readonly code: string;
    readonly label: string;
    readonly isDefault: boolean;
  }>;
}

export function extractAlternateLocales(
  extras: Readonly<Record<string, unknown>>,
): AlternateLocaleConfig | null {
  const inner =
    typeof extras.extra === 'object' && extras.extra !== null
      ? (extras.extra as Record<string, unknown>)
      : extras;
  const raw = inner.alternate;
  if (!Array.isArray(raw)) return null;
  const entries = raw
    .map(parseEntry)
    .filter(
      (e): e is { code: string; label: string; isDefault: boolean; isRoot: boolean } => e !== null,
    );
  if (entries.length === 0) return null;

  let defaultIdx = entries.findIndex((e) => e.isDefault);
  if (defaultIdx === -1) {
    defaultIdx = entries.findIndex((e) => e.isRoot);
  }
  if (defaultIdx === -1) defaultIdx = 0;

  const locales = entries.map((e, idx) => ({
    code: e.code,
    label: e.label,
    isDefault: idx === defaultIdx,
  }));
  return { defaultLocale: entries[defaultIdx]?.code ?? 'en', locales };
}

function parseEntry(
  raw: unknown,
): { code: string; label: string; isDefault: boolean; isRoot: boolean } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const code = typeof obj.lang === 'string' ? obj.lang : null;
  if (code === null) return null;
  const name = typeof obj.name === 'string' ? obj.name : code;
  const link = typeof obj.link === 'string' ? obj.link : '';
  const isDefault = obj.default === true;
  const isRoot = link === '/' || link === '';
  return {
    code,
    label: stripCodePrefix(name, code),
    isDefault,
    isRoot,
  };
}

function stripCodePrefix(name: string, code: string): string {
  // "en - English" → "English"; "🇬🇧 English" → "🇬🇧 English" (untouched)
  const prefix = `${code} - `;
  if (name.startsWith(prefix)) return name.slice(prefix.length);
  return name;
}

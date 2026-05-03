/**
 * Translate a `mkdocs-static-i18n` filename into Starlight's directory-based
 * i18n layout.
 *
 * MkDocs `mkdocs-static-i18n` uses filename suffixes:
 *
 *   page.md           — default locale
 *   page.fr.md        — French
 *   page.zh-CN.md     — Chinese (Simplified)
 *   guides/intro.de.md — nested with locale
 *
 * Starlight's i18n model uses directory prefixes:
 *
 *   page.md
 *   fr/page.md
 *   zh-CN/page.md
 *   de/guides/intro.md
 *
 * Returns the rewritten path when the input ends in `.<locale>.md` for one of
 * the configured locales, or `null` if no rewrite applies (default-locale
 * file, unknown locale code, or non-`.md` extension).
 *
 * Pure: a path string and a locale list in, an optional path string out.
 */

export function renameI18nPath(
  sourcePath: string,
  locales: ReadonlyArray<string>,
): string | null {
  if (!sourcePath.endsWith('.md') || locales.length === 0) {
    return null;
  }
  const stripped = sourcePath.slice(0, -'.md'.length);
  // The last `.<locale>` segment is what we care about. Locale codes can
  // contain a hyphen (`zh-CN`) but never a period.
  const dot = stripped.lastIndexOf('.');
  if (dot === -1) {
    return null;
  }
  const candidate = stripped.slice(dot + 1);
  if (!locales.includes(candidate)) {
    return null;
  }
  const basename = stripped.slice(0, dot);
  return `${candidate}/${basename}.md`;
}

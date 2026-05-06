/**
 * Translate a `mkdocs-static-i18n` filename into Starlight's directory-based
 * i18n layout.
 *
 * MkDocs filename suffixes (`page.fr.md`, `page.zh-CN.md`,
 * `guides/intro.de.md`) become Starlight directory prefixes (`fr/page.md`,
 * `zh-CN/page.md`, `de/guides/intro.md`). Default-locale files
 * (no suffix) pass through.
 *
 * Returns `null` when no rewrite applies (default locale, unknown locale,
 * or non-`.md` extension). Pure.
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

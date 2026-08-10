/**
 * Translate MkDocs 1.6's `draft_docs` setting into a reusable path matcher.
 *
 * MkDocs treats the value as a gitignore-style pattern list. Using the
 * `ignore` package here preserves its anchored paths, directory patterns,
 * comments, and negations instead of approximating them with a glob regex.
 */

import ignore from 'ignore';

export function extractDraftDocsPatterns(
  extras: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> {
  const raw = extras.draft_docs;
  const values = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  return values
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(/\r?\n/))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function createDraftDocsMatcher(
  patterns: ReadonlyArray<string>,
): (sourcePath: string) => boolean {
  if (patterns.length === 0) return () => false;
  const matcher = ignore().add(patterns);
  return (sourcePath) => {
    const normalized = sourcePath.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
    return normalized.length > 0 && matcher.ignores(normalized);
  };
}

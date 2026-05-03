/**
 * Derive a Starlight `editLink.baseUrl` from MkDocs `repo_url` + `edit_uri`.
 *
 * Pure: takes two optional strings, returns the joined URL or null. No I/O.
 *
 * Edge cases:
 *   - Empty `edit_uri` (HTTPX/dirty-equals convention) means "disable edit
 *     link" — returns null.
 *   - Absolute `edit_uri` (Ultralytics pattern) is returned verbatim.
 *   - Trailing slash on repo_url + leading slash on edit_uri are both
 *     normalized.
 */

const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+\-.]*:\/\//i;

export function deriveEditLinkBaseUrl(
  repoUrl: string | null,
  editUri: string | null,
): string | null {
  if (repoUrl === null || editUri === null) return null;
  if (editUri.length === 0) return null;
  if (ABSOLUTE_URL_RE.test(editUri)) return editUri;
  const base = repoUrl.replace(/\/+$/, '');
  const path = editUri.replace(/^\/+/, '');
  return `${base}/${path}`;
}

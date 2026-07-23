/**
 * Parse a Giscus embed out of a Material theme override partial.
 *
 * Material has no first-class comments config — the documented pattern is a
 * `overrides/partials/comments.html` partial embedding the Giscus `<script>`
 * with `data-*` attributes (the conversion-mapping table's `comment-system`
 * row). starlight-giscus reproduces the integration as a Starlight plugin,
 * but hard-requires four options: `repo`, `repoId`, `category`,
 * `categoryId`. This parser extracts exactly those from the partial's
 * markup; when any is missing the caller falls back to the existing
 * recommend-only diagnostic instead of emitting a config that crashes at
 * `astro:config:setup`.
 *
 * Pure: takes the partial's HTML source, returns the config or null.
 */

export interface GiscusConfig {
  readonly repo: string;
  readonly repoId: string;
  readonly category: string;
  readonly categoryId: string;
}

const ATTRS = ['data-repo', 'data-repo-id', 'data-category', 'data-category-id'] as const;

export function parseGiscusFromPartial(html: string): GiscusConfig | null {
  if (!/giscus/i.test(html)) return null;
  const values: string[] = [];
  for (const attr of ATTRS) {
    const m = html.match(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`));
    const value = m?.[1];
    if (value === undefined || value.length === 0) return null;
    values.push(value);
  }
  const [repo, repoId, category, categoryId] = values;
  if (
    repo === undefined ||
    repoId === undefined ||
    category === undefined ||
    categoryId === undefined
  ) {
    return null;
  }
  return { repo, repoId, category, categoryId };
}

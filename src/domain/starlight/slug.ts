/**
 * Derive a Starlight slug from a source `.md` (or `.mdx`) path.
 *
 * Starlight slugs are POSIX-style, leading-slashless, dot-extension stripped.
 * The conversion mirrors Starlight's content-collection convention so the
 * navigation compiler and link rewriter agree on every slug they produce.
 *
 * Rules:
 *   index.md                  → ''                  (collection root)
 *   README.md                 → ''                  (treated as folder index)
 *   getting-started.md        → 'getting-started'
 *   api/auth.md               → 'api/auth'
 *   api/index.md              → 'api'
 *   api/README.md             → 'api'               (folder index, GitHub-style)
 *   ./api/auth.md             → 'api/auth'          (leading ./ stripped)
 *   api\auth.md               → 'api/auth'          (Windows separators normalized)
 *   .mdx files                → same rules
 *
 * `README.md` is matched case-sensitively. Mixed-case spellings such as
 * `Readme.md` or `readme.md` are intentional filenames and remain regular
 * pages. This matches the convention used by `mkdocs-section-index` and
 * the canonical capitalisation in most repositories.
 *
 * Pure: no I/O, no filesystem checks. Throws for malformed input — empty
 * string and non-`.md`/`.mdx` extensions are programmer errors, not data
 * conditions, and surfacing them as exceptions keeps the slug API total over
 * its declared input domain.
 */

const VALID_EXTENSIONS = ['.md', '.mdx'] as const;

export function deriveSlug(sourcePath: string): string {
  if (sourcePath.length === 0) {
    throw new Error('deriveSlug: source path must not be empty');
  }

  const normalized = sourcePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const extension = VALID_EXTENSIONS.find((ext) => normalized.endsWith(ext));
  if (extension === undefined) {
    throw new Error(`deriveSlug: source path "${sourcePath}" must end in .md or .mdx`);
  }

  const withoutExtension = normalized.slice(0, -extension.length);
  // Astro content collections produce lowercased slugs from the entry id by
  // default, so a file `SparkDataStream.md` becomes the URL `/sparkdatastream`.
  // Match that behaviour here so cross-page links like `[…](SparkDataStream.md)`
  // resolve to the same slug Astro renders. Without this, MkDocs-style
  // CamelCase filenames produced 404s in the converted site.
  return stripIndexSuffix(withoutExtension).toLowerCase();
}

function stripIndexSuffix(path: string): string {
  if (path === 'index' || path === 'README') {
    return '';
  }
  if (path.endsWith('/index')) {
    return path.slice(0, -'/index'.length);
  }
  if (path.endsWith('/README')) {
    return path.slice(0, -'/README'.length);
  }
  return path;
}

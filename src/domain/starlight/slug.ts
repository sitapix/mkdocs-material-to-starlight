/**
 * Derive a Starlight slug from a `.md` or `.mdx` path.
 *
 * POSIX-style, leading-slashless, extension-stripped — matches Starlight's
 * content-collection convention so the navigation compiler and link
 * rewriter agree on every slug.
 *
 * Rules:
 *   index.md                  → ''               (collection root)
 *   README.md                 → ''               (folder index)
 *   getting-started.md        → 'getting-started'
 *   api/auth.md               → 'api/auth'
 *   api/index.md              → 'api'
 *   api/README.md             → 'api'            (GitHub-style)
 *   ./api/auth.md             → 'api/auth'
 *   api\auth.md               → 'api/auth'      (Windows separators)
 *
 * `README.md` matches case-sensitively; `Readme.md` and `readme.md` stay
 * regular pages, matching `mkdocs-section-index`.
 *
 * Pure. Throws for empty input or non-`.md`/`.mdx` extension — those are
 * programmer errors, not data conditions.
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

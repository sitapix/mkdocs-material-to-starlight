/**
 * Derive a Starlight slug from a source `.md` (or `.mdx`) path.
 *
 * Starlight slugs are POSIX-style, leading-slashless, dot-extension stripped.
 * The conversion mirrors Starlight's content-collection convention so the
 * navigation compiler and link rewriter agree on every slug they produce.
 *
 * Rules:
 *   index.md                  → ''                  (collection root)
 *   getting-started.md        → 'getting-started'
 *   api/auth.md               → 'api/auth'
 *   api/index.md              → 'api'
 *   ./api/auth.md             → 'api/auth'          (leading ./ stripped)
 *   api\auth.md               → 'api/auth'          (Windows separators normalized)
 *   .mdx files                → same rules
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
  return stripIndexSuffix(withoutExtension);
}

function stripIndexSuffix(path: string): string {
  if (path === 'index') {
    return '';
  }
  if (path.endsWith('/index')) {
    return path.slice(0, -'/index'.length);
  }
  return path;
}

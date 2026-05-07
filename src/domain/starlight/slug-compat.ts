/**
 * Detect source paths whose folder or file basenames Astro will reshape
 * during slug generation, leaving the converter's emitted sidebar refs
 * pointing at slugs that don't exist.
 *
 * Astro's content-collection loader runs `github-slugger` over each path
 * segment to produce the entry's slug. The slugger:
 *   - lowercases everything
 *   - preserves Unicode letters/digits, ASCII alphanumerics, `_`, and `-`
 *   - strips most ASCII punctuation (`.`, `+`, `&`, `?`, `#`, parens, etc.)
 *   - replaces whitespace with `-`
 *
 * When a path segment contains a strip-eligible character, the source
 * filesystem path no longer matches the slug Astro generates — and any
 * sidebar entry the converter emits using the original path will fail
 * with `AstroUserError: The slug "..." does not exist.` at build time.
 *
 * Two real-world breakages this catches:
 *   - karavel-io/platform-component-external-secrets:
 *     `docs/1.0/configuration.md` → slug `10/configuration`, sidebar refs
 *     `1.0/configuration` → 404.
 *   - jujimeizuo/note:
 *     `cs/sys/cmu-15-445/c++-primer.md` → slug `cs/sys/cmu-15-445/c-primer`,
 *     sidebar refs `c++-primer` → 404.
 *
 * Pure: text in, structured findings out. Used by the site-level scanner
 * to emit per-path warnings with the computed Astro slug, so users can
 * either rename the offending paths or hand-edit `astro.config.mjs`
 * sidebar entries before shipping.
 */

const VALID_EXTENSIONS = ['.md', '.mdx'] as const;

/**
 * Return the path segments (folder names or file basename) that
 * `github-slugger` would reshape — i.e. segments where the slug-safe
 * form differs from the original. Extension and `index`/`README`
 * suffixes are excluded from the check (they're stripped by the slug
 * derivation either way).
 */
export function findSlugIncompatibleSegments(sourcePath: string): ReadonlyArray<string> {
  const stripped = stripExtension(sourcePath);
  const segments = stripped.split('/').filter((s) => s.length > 0);
  const out: string[] = [];
  for (const seg of segments) {
    // Skip the conventional `index` / `README` suffix — slug derivation
    // strips them, so any reshape there is non-observable.
    if (seg === 'index' || seg === 'README') continue;
    if (slugifySegment(seg) !== seg.toLowerCase()) {
      out.push(seg);
    }
  }
  return out;
}

/**
 * Compute the slug Astro will generate for a source path, applying
 * github-slugger-style normalization to each segment. Used to surface
 * the *expected* slug to users in diagnostic messages so they can
 * either rename the source or hand-edit the sidebar.
 */
export function expectedAstroSlug(sourcePath: string): string {
  const stripped = stripExtension(sourcePath);
  const segments = stripped.split('/').filter((s) => s.length > 0);
  const slugged = segments.map((s) => slugifySegment(s)).join('/');
  // Mirror github-slugger's behaviour for `path/index` and `path/README`:
  // both collapse to `path` (and a top-level index → empty slug).
  return slugged.replace(/\/(?:index|readme)$/i, '').replace(/^(?:index|readme)$/i, '');
}

function stripExtension(sourcePath: string): string {
  for (const ext of VALID_EXTENSIONS) {
    if (sourcePath.endsWith(ext)) return sourcePath.slice(0, -ext.length);
  }
  return sourcePath;
}

/**
 * Mirror github-slugger's per-segment transform for diagnostic purposes.
 * We don't need bit-exact parity with the published slugger (it has
 * additional logic for emoji and combining marks); the contract here is:
 * a segment that contains only `[A-Za-z0-9_-]` plus Unicode letters/
 * digits round-trips cleanly, and any other character is folded to
 * either `-` (whitespace) or removed (punctuation).
 */
function slugifySegment(segment: string): string {
  let s = segment.toLowerCase();
  // Replace whitespace with `-`.
  s = s.replace(/\s+/g, '-');
  // Strip ASCII punctuation other than `_` and `-`. \p{L}/\p{N} preserves
  // Unicode letters/digits.
  s = s.replace(/[^\p{L}\p{N}_-]/gu, '');
  // Collapse runs of `-`.
  s = s.replace(/-{2,}/g, '-');
  // Trim leading/trailing `-`.
  s = s.replace(/^-+|-+$/g, '');
  return s;
}

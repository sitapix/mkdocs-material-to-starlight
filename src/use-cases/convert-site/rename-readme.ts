/**
 * Source-path rewrites at the top of convertSite, so every downstream
 * consumer (slug map, sidebar, file emit, link rewrite) sees canonical paths.
 *
 * Four rewrites, in order:
 *
 * 1. README.md becomes index.md. MkDocs treats README.md as the section
 *    index; Starlight does not.
 *
 * 2. Section-index conflict: when both `X.md` and `X/index.md` exist (the
 *    sibling .md holds the real content and the directory's index.md is a
 *    snippet shim), drop `X/index.md`. They derive the same slug.
 *
 * 3. i18n locale-suffix rename (when `i18nLocales` is set):
 *    `page.fr.md` becomes `fr/page.md` for `mkdocs-static-i18n` sites.
 *
 * 4. Dots in basename become dashes. Astro's slug derivation mangles
 *    multi-dot filenames (`asp.net-core.md`). Runs after the i18n rename so
 *    locale dots are consumed first.
 *
 * All rewrites preserve the original on-disk path in `diskByEmit`. Pure.
 */

import { renameI18nPath } from '../detect-features/i18n-rename.js';

const README_RE = /(^|\/)README(\.mdx?)$/;

export interface RewriteReadmeResult {
  readonly paths: ReadonlyArray<string>;
  /** emit path → original disk path (for the read step) */
  readonly diskByEmit: ReadonlyMap<string, string>;
  /** disk path → emit path (for slug derivation from disk-keyed lookups) */
  readonly emitByDisk: ReadonlyMap<string, string>;
  readonly dropped: ReadonlyArray<string>;
}

export function rewriteReadmePaths(
  sourcePaths: ReadonlyArray<string>,
  i18nLocales: ReadonlyArray<string> = [],
): RewriteReadmeResult {
  const existing = new Set(sourcePaths);
  const paths: string[] = [];
  const diskByEmit = new Map<string, string>();
  const emitByDisk = new Map<string, string>();
  const dropped: string[] = [];

  // Pre-pass: build the set of "named .md files" so step 2 can detect
  // conflicts of the form `X.md` ↔ `X/index.md` even after step 1 has
  // (potentially) renamed `X/README.md` → `X/index.md`.
  //
  // Astro slug-derivation is case-INSENSITIVE (slugs are lowercased), so
  // `Dataset.md` and `dataset/index.md` collide on the slug `dataset`.
  // Real-world break (japila-books/spark-sql-internals): both files exist
  // and `buildSlugMap` errored with "slug-conflict: Dataset.md and
  // dataset/index.md both derive the same slug" before this pass even
  // saw them as related. Keep the case-sensitive set for the typical
  // case AND a parallel case-folded set so the lookup catches case-only
  // mismatches.
  const namedSiblingStems = new Set<string>();
  const namedSiblingStemsLower = new Set<string>();
  const existingLower = new Set<string>(sourcePaths.map((p) => p.toLowerCase()));
  for (const p of sourcePaths) {
    const ext = /\.(mdx?)$/.exec(p);
    if (ext === null) continue;
    const stem = p.slice(0, -ext[0].length);
    // Only register stems that are NOT themselves an index.md form, so
    // we don't shadow the conflict detection below.
    const base = stem.split('/').pop() ?? '';
    if (base === 'index' || base === 'README') continue;
    namedSiblingStems.add(stem);
    namedSiblingStemsLower.add(stem.toLowerCase());
  }

  for (const sourcePath of sourcePaths) {
    // Step 1: README.md → index.md
    const readmeMatch = README_RE.exec(sourcePath);
    let target = sourcePath;
    if (readmeMatch !== null) {
      const ext = readmeMatch[2] ?? '.md';
      target = sourcePath.replace(README_RE, `$1index${ext}`);
      if (existing.has(target)) {
        dropped.push(sourcePath);
        continue;
      }
    }
    // Step 2: section-index conflict resolution. When `target` is now
    // `<stem>/index.<ext>` AND a sibling `<stem>.<ext>` exists in the
    // input, both produce the same slug. Prefer the named sibling (it
    // typically holds the substantive content; the directory's
    // index.md is often a thin section-index shim like `--8<-- "X.md"`).
    const indexMatch = /^(.+)\/index(\.mdx?)$/.exec(target);
    if (indexMatch !== null) {
      const stem = indexMatch[1] ?? '';
      const stemLower = stem.toLowerCase();
      // The named sibling could be either extension AND a case-only
      // variation (Astro lowercases slugs, so `Dataset.md` collides with
      // `dataset/index.md`). Check exact-case first, then case-folded.
      const exactMatch =
        namedSiblingStems.has(stem) && (existing.has(`${stem}.md`) || existing.has(`${stem}.mdx`));
      const caseFoldedMatch =
        !exactMatch &&
        namedSiblingStemsLower.has(stemLower) &&
        (existingLower.has(`${stemLower}.md`) || existingLower.has(`${stemLower}.mdx`));
      if (exactMatch || caseFoldedMatch) {
        dropped.push(sourcePath);
        continue;
      }
    }
    // Step 3: i18n locale-suffix rename. Consumes the locale dot before
    // step 4 slugifies any remaining dots, so `page.fr.md` becomes
    // `fr/page.md` rather than `page-fr.md`.
    if (i18nLocales.length > 0) {
      const renamed = renameI18nPath(target, i18nLocales);
      if (renamed !== null) target = renamed;
    }
    // Step 4: dots in basename → dashes (Astro slug-derivation safety).
    target = slugifyBasenameDots(target);
    paths.push(target);
    diskByEmit.set(target, sourcePath);
    emitByDisk.set(sourcePath, target);
  }

  return { paths, diskByEmit, emitByDisk, dropped };
}

/**
 * Replace dots in the basename portion of a path with dashes. Directory
 * components and the final `.md`/`.mdx` extension are preserved.
 *
 *   getting-started/asp.net-core.md  →  getting-started/asp-net-core.md
 *   guide/foo.bar.baz.mdx            →  guide/foo-bar-baz.mdx
 *   next.js/intro.md                 →  next.js/intro.md   (dir untouched)
 */
function slugifyBasenameDots(path: string): string {
  const lastSlash = path.lastIndexOf('/');
  const dir = lastSlash === -1 ? '' : path.slice(0, lastSlash + 1);
  const basename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
  // Match the trailing .md or .mdx and isolate the stem.
  const extMatch = /\.(mdx?)$/.exec(basename);
  if (extMatch === null) return path;
  const ext = extMatch[0];
  const stem = basename.slice(0, -ext.length);
  if (!stem.includes('.')) return path;
  const dashed = stem.replace(/\./g, '-');
  return `${dir}${dashed}${ext}`;
}

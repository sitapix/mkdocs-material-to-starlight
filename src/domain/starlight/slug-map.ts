/**
 * Bidirectional map from source path to Starlight slug.
 *
 * The map is the single source of truth for slug identity. The link rewriter
 * (Markdown link `./api.md` → Starlight slug `api`), the navigation compiler
 * (sidebar entries reference slugs), and the per-document compiler
 * (frontmatter `sidebar.label` synthesis) all read from the same map, so
 * inconsistencies are impossible by construction.
 *
 * Pure data structure — built once per run from the discovered source paths.
 * Subsequent reads are O(1). Conflicts (two source paths resolving to the
 * same slug, e.g. `api.md` and `api/index.md`) are rejected at build time
 * with a typed error rather than silently masking one entry.
 */

import { ok, err, type Result } from '../result.js';
import { deriveSlug } from './slug.js';

interface SlugRecord {
  readonly sourcePath: string;
  readonly slug: string;
}

export interface SlugMap {
  readonly size: number;
  getBySourcePath(sourcePath: string): SlugRecord | undefined;
  getBySlug(slug: string): SlugRecord | undefined;
  entries(): ReadonlyArray<SlugRecord>;
}

export interface SlugConflict {
  readonly message: string;
}

export interface BuildSlugMapOptions {
  /**
   * Optional path transform applied before slug derivation. The original
   * `sourcePath` remains the lookup key (`getBySourcePath`), but the derived
   * slug reflects the transformed path. Used by the interface layer to thread
   * `mkdocs-static-i18n` rename rules (e.g., `page.fr.md` → `fr/page.md`)
   * into the slug without putting i18n knowledge in the domain.
   */
  readonly pathTransform?: (sourcePath: string) => string | null;
  /** Backwards-compatible shortcut for the i18n rename case. */
  readonly i18nLocales?: ReadonlyArray<string>;
}

export function buildSlugMap(
  sourcePaths: ReadonlyArray<string>,
  options: BuildSlugMapOptions = {},
): Result<SlugMap, SlugConflict> {
  const records: SlugRecord[] = [];
  const bySource = new Map<string, SlugRecord>();
  const bySlug = new Map<string, SlugRecord>();
  const transform = resolveTransform(options);

  for (const sourcePath of sourcePaths) {
    const transformed = transform(sourcePath) ?? sourcePath;
    const slug = deriveSlug(transformed);
    const existing = bySlug.get(slug);
    if (existing !== undefined) {
      return err({
        message: `slug conflict at "${slug}": "${existing.sourcePath}" and "${sourcePath}" both derive the same slug`,
      });
    }
    const record: SlugRecord = { sourcePath, slug };
    records.push(record);
    bySource.set(sourcePath, record);
    bySlug.set(slug, record);
  }

  return ok({
    size: records.length,
    getBySourcePath: (sourcePath) => bySource.get(sourcePath),
    getBySlug: (slug) => bySlug.get(slug),
    entries: () => records,
  });
}

function resolveTransform(
  options: BuildSlugMapOptions,
): (sourcePath: string) => string | null {
  if (options.pathTransform !== undefined) {
    return options.pathTransform;
  }
  const locales = options.i18nLocales ?? [];
  if (locales.length === 0) {
    return () => null;
  }
  return (sourcePath) => i18nRenameInline(sourcePath, locales);
}

// Inline copy of the i18n rename rule. Kept here (rather than imported from a
// use-case) so the domain layer has no dependency on `use-cases/`.
function i18nRenameInline(
  sourcePath: string,
  locales: ReadonlyArray<string>,
): string | null {
  if (!sourcePath.endsWith('.md') || locales.length === 0) {
    return null;
  }
  const stripped = sourcePath.slice(0, -'.md'.length);
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

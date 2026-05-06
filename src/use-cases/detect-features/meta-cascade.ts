/**
 * Material `meta` plugin (Insiders): per-directory `.meta.yml` files
 * provide frontmatter defaults that cascade DOWN into every page in that
 * directory and its subdirectories.
 *
 * Cascade rules:
 *   1. A `.meta.yml` at `docs/.meta.yml` applies to every page under
 *      `docs/...`.
 *   2. A `.meta.yml` at `docs/api/.meta.yml` overlays — its keys win over
 *      ancestor `.meta.yml` for any page under `docs/api/...`.
 *   3. A page's own frontmatter wins over every cascaded default.
 *
 * Pure: takes parsed YAML maps in, returns a function that resolves a
 * page's effective defaults given the page's source-relative path.
 */

import type { YamlDecoder } from '../../domain/ports/yaml-decoder.js';

/** A `.meta.yml` entry: source-relative path + parsed object. */
export interface MetaEntry {
  /** Path relative to the docs dir, e.g. `api/.meta.yml`. */
  readonly relPath: string;
  /** Parsed YAML body (object); non-object roots are ignored upstream. */
  readonly defaults: Readonly<Record<string, unknown>>;
}

/**
 * Parse a list of `[relPath, content]` pairs into MetaEntry objects.
 * Files whose YAML doesn't decode to an object are skipped silently — the
 * scanner upstream already reports a diagnostic for those.
 */
export function parseMetaFiles(
  files: ReadonlyArray<readonly [string, string]>,
  yaml: YamlDecoder,
): ReadonlyArray<MetaEntry> {
  const out: MetaEntry[] = [];
  for (const [relPath, content] of files) {
    const decoded = yaml.decode(content);
    if (!decoded.ok) continue;
    if (!isPlainObject(decoded.value)) continue;
    out.push({ relPath, defaults: decoded.value });
  }
  return out;
}

/**
 * Compute the effective frontmatter defaults for a page at `pagePath`,
 * by cascading every applicable `.meta.yml` (root → leaf, deepest wins).
 *
 * `pagePath` is the page's source-relative path (e.g. `api/auth.md`).
 * The lookup walks every ancestor directory of the page; a `.meta.yml`
 * at the same depth as the page applies (it lives in the page's own dir).
 *
 * Returns an empty object when no `.meta.yml` files apply.
 */
export function effectiveMetaDefaults(
  pagePath: string,
  entries: ReadonlyArray<MetaEntry>,
): Readonly<Record<string, unknown>> {
  // Walk page dir + ancestors, collect matching entries shallowest-first.
  const pageDir = dirOf(pagePath);
  const ancestors = ancestorDirs(pageDir); // ['', 'a', 'a/b', ...]
  const merged: Record<string, unknown> = {};
  for (const dir of ancestors) {
    const expected = dir === '' ? '.meta.yml' : `${dir}/.meta.yml`;
    const hit = entries.find((e) => e.relPath === expected);
    if (hit !== undefined) {
      Object.assign(merged, hit.defaults);
    }
  }
  return merged;
}

/**
 * Merge cascaded defaults into a page's existing frontmatter. Page values
 * always win — cascaded defaults only fill missing keys. Pure.
 */
export function mergeFrontmatter(
  pageFrontmatter: Readonly<Record<string, unknown>>,
  cascadedDefaults: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return { ...cascadedDefaults, ...pageFrontmatter };
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function ancestorDirs(dir: string): ReadonlyArray<string> {
  // '' → ['']; 'a' → ['', 'a']; 'a/b/c' → ['', 'a', 'a/b', 'a/b/c'].
  if (dir === '') return [''];
  const parts = dir.split('/');
  const out: string[] = [''];
  let cursor = '';
  for (const p of parts) {
    cursor = cursor === '' ? p : `${cursor}/${p}`;
    out.push(cursor);
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

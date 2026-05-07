/**
 * Extract exclude patterns from `mkdocs-exclude` plugin config and apply
 * them to a list of source paths.
 *
 * Plugin shape (from mkdocs.yml):
 *
 *   plugins:
 *     - exclude:
 *         glob:
 *           - "*.tmp"
 *           - "private/*.md"
 *         regex:
 *           - '\.draft\.'
 *
 * Globs use fnmatch-style semantics (`/` is NOT a separator) — `*.tmp`
 * matches `foo/bar.tmp`. Regex patterns are JavaScript regex (close enough
 * to Python regex for the patterns users actually write here).
 *
 * Both lists are optional; an empty config matches nothing. Pure: takes
 * config in, returns a predicate (and a filter helper).
 */

import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';

export interface ExcludePatterns {
  readonly glob: ReadonlyArray<string>;
  readonly regex: ReadonlyArray<string>;
}

export function extractExcludePatterns(plugins: ReadonlyArray<MkdocsPlugin>): ExcludePatterns {
  const exclude = plugins.find((p) => p.name === 'exclude');
  if (exclude === undefined) return { glob: [], regex: [] };
  const opts = exclude.options as Record<string, unknown> | undefined;
  return {
    glob: stringArray(opts?.glob),
    regex: stringArray(opts?.regex),
  };
}

/**
 * Returns true when `path` matches any of the patterns. `path` is the
 * source-relative path (e.g. `private/secret.md`).
 */
export function isExcluded(path: string, patterns: ExcludePatterns): boolean {
  for (const g of patterns.glob) {
    if (globToRegex(g).test(path)) return true;
  }
  for (const r of patterns.regex) {
    try {
      if (new RegExp(r).test(path)) return true;
    } catch {
      // Invalid regex — silently skip; the diagnostic layer can flag this
      // separately if needed. Better to over-include than crash on a typo.
    }
  }
  return false;
}

export function applyExcludePatterns<T extends string>(
  paths: ReadonlyArray<T>,
  patterns: ExcludePatterns,
): ReadonlyArray<T> {
  if (patterns.glob.length === 0 && patterns.regex.length === 0) return paths;
  return paths.filter((p) => !isExcluded(p, patterns));
}

function stringArray(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * fnmatch-style glob → RegExp. `*` matches any run of characters (including
 * `/`), `?` matches any single character. Literal characters are escaped.
 * Anchored at both ends so the whole path must match the pattern.
 */
function globToRegex(glob: string): RegExp {
  let out = '^';
  for (const ch of glob) {
    if (ch === '*') out += '.*';
    else if (ch === '?') out += '.';
    else if (/[.+^${}()|[\]\\]/.test(ch)) out += `\\${ch}`;
    else out += ch;
  }
  out += '$';
  return new RegExp(out);
}

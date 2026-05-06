/**
 * Pure ranking of candidate `mkdocs.yml` / `mkdocs.yaml` paths.
 *
 * The interface layer asks an adapter to walk the filesystem; that walk
 * yields a flat list of POSIX-relative paths. This module decides which
 * one is the most likely "real" config and which others to surface as
 * alternatives in interactive UX. No I/O happens here — call-site honesty.
 *
 * Ranking is intentionally conservative:
 *   1. Drop anything inside a heavyweight/build-output directory. Walking
 *      those is the adapter's job, but we re-prune defensively so a wider
 *      walk in the future cannot silently regress.
 *   2. Lower depth wins. A root-level `mkdocs.yml` beats a nested one.
 *   3. A doc-like containing dir name (`docs`, `documentation`, `website`,
 *      ...) wins over a generic name at the same depth.
 *   4. `mkdocs.yml` wins over `mkdocs.yaml` (the canonical extension).
 *   5. Alphabetical relPath as a deterministic tiebreaker.
 *
 * Returning `kind: 'none'` is reserved for the truly empty case; any
 * surviving candidate is reported as `found.primary` with the rest as
 * `alternatives`, capped so the interactive list stays scannable.
 */

const PRUNED_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '_site',
  'site',
  '.git',
  '.cache',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.astro',
  'vendor',
  'target',
  'coverage',
]);

const DOC_LIKE_DIR_NAMES: ReadonlySet<string> = new Set([
  'doc',
  'docs',
  'documentation',
  'website',
  'mkdocs',
  'docsource',
  'docssource',
  'doc-source',
]);

const MAX_ALTERNATIVES = 8;

export interface ConfigCandidate {
  /** POSIX-style path relative to the search root, e.g. "website/mkdocs.yml". */
  readonly relPath: string;
  /** Directory containing the config, relative to the search root. "" = root. */
  readonly configDir: string;
  /** Path-segment depth — root = 0. */
  readonly depth: number;
  /** Why this candidate ranks where it does (used for UX hints). */
  readonly reasons: ReadonlyArray<string>;
}

export type RankResult =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'found';
      readonly primary: ConfigCandidate;
      readonly alternatives: ReadonlyArray<ConfigCandidate>;
    };

export function rankCandidates(rawPaths: ReadonlyArray<string>): RankResult {
  const candidates: ConfigCandidate[] = [];
  for (const raw of rawPaths) {
    const candidate = toCandidate(raw);
    if (candidate !== null) candidates.push(candidate);
  }
  if (candidates.length === 0) return { kind: 'none' };

  candidates.sort(compareCandidates);
  const [primary, ...rest] = candidates;
  if (primary === undefined) return { kind: 'none' };
  return {
    kind: 'found',
    primary,
    alternatives: rest.slice(0, MAX_ALTERNATIVES),
  };
}

function toCandidate(rawPath: string): ConfigCandidate | null {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.length === 0) return null;

  const parts = normalized.split('/');
  const basename = parts[parts.length - 1] ?? '';
  if (basename !== 'mkdocs.yml' && basename !== 'mkdocs.yaml') return null;

  const dirParts = parts.slice(0, -1);
  for (const segment of dirParts) {
    if (PRUNED_PATH_SEGMENTS.has(segment)) return null;
  }

  const configDir = dirParts.join('/');
  const depth = dirParts.length;
  const reasons: string[] = [];
  if (depth === 0) reasons.push('at project root');
  const containingDir = dirParts[dirParts.length - 1];
  if (containingDir !== undefined && DOC_LIKE_DIR_NAMES.has(containingDir)) {
    reasons.push(`doc-like dir name "${containingDir}"`);
  }
  return { relPath: normalized, configDir, depth, reasons };
}

function compareCandidates(a: ConfigCandidate, b: ConfigCandidate): number {
  if (a.depth !== b.depth) return a.depth - b.depth;
  const aDocLike = isDocLike(a) ? 0 : 1;
  const bDocLike = isDocLike(b) ? 0 : 1;
  if (aDocLike !== bDocLike) return aDocLike - bDocLike;
  const aYml = a.relPath.endsWith('.yml') ? 0 : 1;
  const bYml = b.relPath.endsWith('.yml') ? 0 : 1;
  if (aYml !== bYml) return aYml - bYml;
  return a.relPath.localeCompare(b.relPath);
}

function isDocLike(candidate: ConfigCandidate): boolean {
  if (candidate.depth === 0) return false;
  const containingDir = candidate.configDir.split('/').pop() ?? '';
  return DOC_LIKE_DIR_NAMES.has(containingDir);
}

/**
 * Resolves the effective project directory for a converter run.
 *
 * Happy path: the user passed `/repo` and `/repo/mkdocs.yml` exists — return
 * `/repo` unchanged. Recovery path: the user passed a wrapper directory
 * (common in monorepos) and `mkdocs.yml` lives in `/repo/website/` or
 * `/repo/packages/<name>/website/`. The resolver walks the project via the
 * `ConfigDiscoverer` port and decides whether to redirect.
 *
 * Decisions:
 *   - Exactly one viable candidate after pruning → silently redirect; the
 *     caller is expected to emit an `info` diagnostic describing the
 *     redirect (call-site honesty).
 *   - Multiple candidates → return an `ambiguous` error with the full list,
 *     so the caller can ask the user (interactive) or surface the choices
 *     in an error message (non-interactive). We never auto-pick among
 *     multiple — both outcomes have visible side effects (different
 *     `docs_dir` resolution, different `outputDir` layout).
 *   - Zero candidates → return `no-config-anywhere` so the caller surfaces
 *     the existing `config-not-found` error verbatim.
 *
 * Pure orchestration: composes the `FileSystem` and `ConfigDiscoverer`
 * ports with the `rankCandidates` use-case. Tested with in-memory fakes.
 */

import { posix } from 'node:path';
import { ok, err, type Result } from '../../domain/result.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { ConfigDiscoverer } from '../../domain/ports/config-discoverer.js';
import { rankCandidates } from './rank-candidates.js';

interface AutoDiscoveryNote {
  readonly fromDir: string;
  readonly discoveredRelPath: string;
}

export interface ResolvedProjectDir {
  readonly projectDir: string;
  /** Non-null when discovery redirected us to a subdir. */
  readonly autoDiscovery: AutoDiscoveryNote | null;
}

export type ResolveProjectDirError =
  | { readonly kind: 'no-config-anywhere'; readonly searchedDir: string }
  | {
      readonly kind: 'ambiguous';
      readonly searchedDir: string;
      readonly candidates: ReadonlyArray<string>;
    };

export async function resolveProjectDir(
  inputDir: string,
  fs: FileSystem,
  discoverer: ConfigDiscoverer,
): Promise<Result<ResolvedProjectDir, ResolveProjectDirError>> {
  const rootConfigPath = joinPosix(inputDir, 'mkdocs.yml');
  if (await fs.exists(rootConfigPath)) {
    return ok({ projectDir: inputDir, autoDiscovery: null });
  }

  const discovery = await discoverer.findMkdocsConfigs(inputDir);
  if (!discovery.ok) {
    return err({ kind: 'no-config-anywhere', searchedDir: inputDir });
  }
  const ranked = rankCandidates(discovery.value);
  if (ranked.kind === 'none') {
    return err({ kind: 'no-config-anywhere', searchedDir: inputDir });
  }
  if (ranked.alternatives.length > 0) {
    const candidates = [
      ranked.primary.relPath,
      ...ranked.alternatives.map((c) => c.relPath),
    ];
    return err({ kind: 'ambiguous', searchedDir: inputDir, candidates });
  }
  const projectDir = joinPosix(inputDir, ranked.primary.configDir);
  return ok({
    projectDir,
    autoDiscovery: {
      fromDir: inputDir,
      discoveredRelPath: ranked.primary.relPath,
    },
  });
}

function joinPosix(dir: string, rel: string): string {
  if (rel === '') return dir;
  // Always use POSIX semantics so the path stays valid as a string identifier
  // even on Windows; downstream `node:path` joins are platform-aware and will
  // re-normalize when used for actual disk reads.
  if (dir.endsWith('/') || dir.endsWith('\\')) {
    return `${dir}${rel}`;
  }
  return posix.join(dir, rel);
}

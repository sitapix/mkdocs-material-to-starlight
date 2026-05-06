/**
 * Pure path containment check — does `candidate` resolve inside `baseDir`?
 *
 * Both paths must already be canonicalised (callers run `fs.realpath` on
 * each before calling). This function performs only the prefix-comparison
 * step; the I/O side (resolving symlinks, normalising `..`) lives in the
 * `FileSystem` port adapter so the domain stays pure.
 *
 * Rejects:
 *   - paths that share the base as a *substring* but not a path-prefix
 *     (e.g. `/project/docs-secret/file` against `/project/docs`)
 *   - paths that escape via `..` (the canonicalisation step is the caller's
 *     responsibility, but the prefix check catches the result)
 *   - any candidate not anchored at `baseDir`
 *
 * Accepts:
 *   - the base directory itself
 *   - any descendant
 *
 * The function is OS-aware: it accepts both `/` and `\` as separators so the
 * same call works on POSIX and Windows. Callers should still canonicalise
 * via the platform's `path.resolve` before passing in.
 */

import { err, ok, type Result } from '../result.js';

export interface PathEscapesBase {
  readonly code: 'path-escapes-base';
  readonly baseDir: string;
  readonly candidate: string;
  readonly message: string;
}

export function assertPathWithin(
  baseDir: string,
  candidate: string,
): Result<true, PathEscapesBase> {
  const normBase = stripTrailingSep(baseDir);
  if (candidate === normBase) {
    return ok(true);
  }
  const sepCandidates = ['/', '\\'];
  for (const sep of sepCandidates) {
    if (candidate.startsWith(normBase + sep)) {
      return ok(true);
    }
  }
  return err({
    code: 'path-escapes-base',
    baseDir,
    candidate,
    message:
      `path escapes its base directory: \`${candidate}\` is not inside \`${baseDir}\`. ` +
      `This is rejected to prevent symlink-mediated reads outside the project tree ` +
      `or \`..\` traversal in user-supplied paths.`,
  });
}

function stripTrailingSep(path: string): string {
  if (path.length === 0) return path;
  const last = path[path.length - 1];
  if (last === '/' || last === '\\') {
    return path.slice(0, -1);
  }
  return path;
}

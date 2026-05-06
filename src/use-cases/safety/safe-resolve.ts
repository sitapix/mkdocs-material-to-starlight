/**
 * Safe path resolution: realpath the candidate AND the base, then assert
 * containment. Rejects symlink escapes (`docs/link → /etc/passwd`) and `..`
 * traversal in user-supplied snippet/include paths.
 *
 * Use at every site where the converter reads a path that originates in the
 * source document or in a user-supplied CLI flag (snippet base paths,
 * include-markdown directives, asset references). Direct `fs.readText(path)`
 * is unsafe at these boundaries: see CVE-2026-21715 and the Node.js Secure
 * Coding handbook on path traversal.
 *
 * Returns the canonical (realpathed) path on success, or a typed error
 * describing the failure mode so callers can produce specific diagnostics.
 */

import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok, type Result } from '../../domain/result.js';
import { assertPathWithin, type PathEscapesBase } from '../../domain/safety/path-within.js';

export type SafeResolveError =
  | { readonly code: 'base-not-resolvable'; readonly baseDir: string; readonly message: string }
  | {
      readonly code: 'candidate-not-resolvable';
      readonly candidate: string;
      readonly message: string;
    }
  | PathEscapesBase;

export async function safeResolveWithin(
  baseDir: string,
  candidate: string,
  fs: FileSystem,
): Promise<Result<string, SafeResolveError>> {
  const baseReal = await fs.realpath(baseDir);
  if (!baseReal.ok) {
    return err({
      code: 'base-not-resolvable',
      baseDir,
      message: `base directory cannot be canonicalised: ${baseReal.error.message}`,
    });
  }
  const candidateReal = await fs.realpath(candidate);
  if (!candidateReal.ok) {
    return err({
      code: 'candidate-not-resolvable',
      candidate,
      message: `candidate path cannot be canonicalised: ${candidateReal.error.message}`,
    });
  }
  const within = assertPathWithin(baseReal.value, candidateReal.value);
  if (!within.ok) {
    return within;
  }
  return ok(candidateReal.value);
}

/**
 * FileSystem port — the boundary every use-case crosses to read or check
 * existence of files. Concrete implementations live in `infrastructure/fs`;
 * tests inject in-memory fakes built from a plain Map.
 *
 * Pure declaration: no I/O lives here. The use-cases that consume this port
 * accept it as a function parameter, never reach for a global fs module, and
 * therefore stay testable without filesystem fixtures.
 *
 * Operations are async because real implementations (and any future S3, HTTP,
 * or virtual-fs adapters) need to be. Failures are returned as `Result`, never
 * thrown — the I/O boundary is the one place where exceptions might originate
 * (from a third-party library), and the adapter is responsible for converting
 * them into `Result.err`.
 */

import type { Result } from '../result.js';

export interface FileSystemError {
  readonly code: 'not-found' | 'access-denied' | 'unknown';
  readonly path: string;
  readonly message: string;
}

export interface FileSystem {
  readText(path: string): Promise<Result<string, FileSystemError>>;
  exists(path: string): Promise<boolean>;
  /**
   * Canonicalise a path: resolve symlinks, normalise `..` segments. Required
   * for safe path-containment checks against user-supplied input. Returns
   * `not-found` when the path itself does not exist on disk.
   *
   * Adapters that have no concept of symlinks (in-memory test fakes) MAY
   * return the input verbatim, which is sound for the prefix-check use case
   * — escape attempts via `..` are still caught because callers
   * `path.resolve()` first.
   */
  realpath(path: string): Promise<Result<string, FileSystemError>>;
}

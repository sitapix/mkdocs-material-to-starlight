/**
 * DirectoryReader port — recursively lists files under a directory, returning
 * paths relative to the directory root.
 *
 * Pure declaration. The site converter consumes this port to discover Markdown
 * files in `docs_dir` without coupling to `node:fs` or any specific glob lib.
 * Tests inject an in-memory adapter built from a plain Map.
 *
 * The output is a sorted list of POSIX-style relative paths so behaviour is
 * deterministic across platforms (macOS/Linux/Windows).
 */

import type { Result } from '../result.js';

export interface DirectoryReadError {
  readonly code: 'not-found' | 'access-denied' | 'unknown';
  readonly path: string;
  readonly message: string;
}

export interface DirectoryReader {
  /**
   * List every regular file whose path matches one of the supplied extensions
   * (e.g. `['.md', '.mdx']`), recursing into subdirectories. Paths are
   * returned relative to `root` and sorted alphabetically. Files starting
   * with `.` and directories starting with `_` are skipped (the latter
   * mirrors Starlight's convention for partials).
   */
  list(
    root: string,
    extensions: ReadonlyArray<string>,
  ): Promise<Result<ReadonlyArray<string>, DirectoryReadError>>;
}

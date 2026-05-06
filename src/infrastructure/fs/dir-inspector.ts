/**
 * Node fs adapter for the DirInspector port.
 *
 * Resolution policy:
 *   - "missing"   — path does not exist OR resolves to a non-directory
 *   - "empty"     — path exists, is a directory, contains zero entries
 *   - "non-empty" — path exists, is a directory, contains >=1 entry
 *
 * All errors collapse to "missing" so callers don't need to discriminate
 * between EACCES, ENOENT, ENOTDIR, etc. The wizard treats anything that
 * isn't an obviously-clobberable directory as safe to write — the convert
 * path's own preflight will surface a precise error if the assumption was
 * wrong.
 */

import { stat, readdir } from 'node:fs/promises';
import type {
  DirInspector,
  DirState,
} from '../../domain/wizard/ports/dir-inspector.js';

export function createNodeDirInspector(): DirInspector {
  return {
    async inspect(path: string): Promise<DirState> {
      try {
        const info = await stat(path);
        if (!info.isDirectory()) return 'missing';
        const entries = await readdir(path);
        return entries.length === 0 ? 'empty' : 'non-empty';
      } catch {
        return 'missing';
      }
    },
  };
}

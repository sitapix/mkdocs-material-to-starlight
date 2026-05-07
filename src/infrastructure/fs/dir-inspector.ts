/**
 * Node fs adapter for the DirInspector port.
 *
 * Resolution policy:
 *   - "missing"        — path does not exist OR resolves to a non-directory
 *   - "empty"          — path exists, is a directory, contains zero entries
 *   - "astro-project"  — non-empty AND has `astro.config.{mjs,ts,js,mts}` and
 *                        `src/content/docs/` (the Starlight content shape)
 *   - "non-empty"      — non-empty fallback for anything else
 *
 * All errors collapse to "missing" so callers don't need to discriminate
 * between EACCES, ENOENT, ENOTDIR, etc. The wizard treats anything that
 * isn't an obviously-clobberable directory as safe to write — the convert
 * path's own preflight will surface a precise error if the assumption was
 * wrong.
 *
 * The astro-project signature is intentionally narrow: just an astro config
 * file plus the canonical content/docs path. Stricter detection would catch
 * more edge cases but also misclassify legitimately-empty `src/` skeletons.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { DirInspector, DirState } from '../../domain/wizard/ports/dir-inspector.js';

const ASTRO_CONFIG_NAMES: ReadonlyArray<string> = [
  'astro.config.mjs',
  'astro.config.ts',
  'astro.config.js',
  'astro.config.mts',
];

export function createNodeDirInspector(): DirInspector {
  return {
    async inspect(path: string): Promise<DirState> {
      try {
        const info = await stat(path);
        if (!info.isDirectory()) return 'missing';
        const entries = await readdir(path);
        if (entries.length === 0) return 'empty';
        if (await looksLikeAstroProject(path, entries)) return 'astro-project';
        return 'non-empty';
      } catch {
        return 'missing';
      }
    },
  };
}

async function looksLikeAstroProject(
  root: string,
  entries: ReadonlyArray<string>,
): Promise<boolean> {
  const hasAstroConfig = entries.some((e) => ASTRO_CONFIG_NAMES.includes(e));
  if (!hasAstroConfig) return false;
  try {
    const docsInfo = await stat(join(root, 'src', 'content', 'docs'));
    return docsInfo.isDirectory();
  } catch {
    return false;
  }
}

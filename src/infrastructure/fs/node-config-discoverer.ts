/**
 * Production adapter for `ConfigDiscoverer` using `node:fs/promises`.
 *
 * Walks the project tree looking for `mkdocs.yml` / `mkdocs.yaml`, with
 * two safeguards so this stays fast on real-world repos:
 *
 *   1. Bounded depth (default 4 — covers monorepos that nest docs under
 *      `packages/<name>/website/` without ever entering deep build trees).
 *   2. A prune list (`node_modules`, `dist`, `build`, `.git`, ...) so we
 *      never even open the directory entries of well-known heavy dirs.
 *
 * Output paths are POSIX-style and sorted, matching the existing
 * DirectoryReader adapter so behaviour is deterministic across OSes.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ok, err } from '../../domain/result.js';
import type { ConfigDiscoverer } from '../../domain/ports/config-discoverer.js';
import type { DirectoryReadError } from '../../domain/ports/directory-reader.js';

const DEFAULT_MAX_DEPTH = 4;

const PRUNED_DIRS: ReadonlySet<string> = new Set([
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

export interface NodeConfigDiscovererOptions {
  /** Walk depth limit. Root files are depth 0. Defaults to 4. */
  readonly maxDepth?: number;
}

export function createNodeConfigDiscoverer(
  options: NodeConfigDiscovererOptions = {},
): ConfigDiscoverer {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  return {
    async findMkdocsConfigs(root) {
      try {
        const collected: string[] = [];
        await walk(root, '', 0, maxDepth, collected);
        collected.sort();
        return ok(collected);
      } catch (cause) {
        return err(translateError(cause, root));
      }
    },
  };
}

async function walk(
  root: string,
  relative: string,
  depth: number,
  maxDepth: number,
  collected: string[],
): Promise<void> {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    const childRel = relative === '' ? name : `${relative}/${name}`;
    if (entry.isDirectory()) {
      if (PRUNED_DIRS.has(name)) continue;
      if (name.startsWith('.') && name !== '.') continue;
      if (depth + 1 > maxDepth) continue;
      await walk(root, childRel, depth + 1, maxDepth, collected);
      continue;
    }
    if (entry.isFile() && (name === 'mkdocs.yml' || name === 'mkdocs.yaml')) {
      collected.push(childRel);
    }
  }
}

function translateError(cause: unknown, path: string): DirectoryReadError {
  if (!isErrnoLike(cause)) {
    return { code: 'unknown', path, message: 'unknown filesystem error' };
  }
  if (cause.code === 'ENOENT') {
    return { code: 'not-found', path, message: `directory not found: ${path}` };
  }
  if (cause.code === 'EACCES' || cause.code === 'EPERM') {
    return {
      code: 'access-denied',
      path,
      message: `access denied: ${path} (${cause.code})`,
    };
  }
  return {
    code: 'unknown',
    path,
    message: `directory walk failed at ${path}: ${cause.code ?? 'unknown'}`,
  };
}

interface ErrnoLike {
  readonly code?: string;
}

function isErrnoLike(value: unknown): value is ErrnoLike {
  return typeof value === 'object' && value !== null && 'code' in value;
}

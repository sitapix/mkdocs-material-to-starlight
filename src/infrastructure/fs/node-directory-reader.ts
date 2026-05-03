/**
 * Production adapter for `DirectoryReader` using `node:fs/promises`.
 *
 * Recursively lists files under a root, filtering by extension, skipping
 * dot-prefixed files and underscore-prefixed directories (the latter is
 * Starlight's convention for partials). Output paths are POSIX-style and
 * sorted, so behaviour is deterministic across operating systems.
 *
 * Imperative shell — `node:fs` is the only direct dependency.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ok, err } from '../../domain/result.js';
import type {
  DirectoryReadError,
  DirectoryReader,
} from '../../domain/ports/directory-reader.js';

export function createNodeDirectoryReader(): DirectoryReader {
  return {
    async list(root, extensions) {
      try {
        const collected: string[] = [];
        await walk(root, '', extensions, collected);
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
  extensions: ReadonlyArray<string>,
  collected: string[],
): Promise<void> {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith('.')) {
      continue;
    }
    const childRel = relative === '' ? name : `${relative}/${name}`;
    if (entry.isDirectory()) {
      if (name.startsWith('_')) {
        continue;
      }
      await walk(root, childRel, extensions, collected);
      continue;
    }
    if (entry.isFile() && hasMatchingExtension(name, extensions)) {
      collected.push(childRel);
    }
  }
}

function hasMatchingExtension(name: string, extensions: ReadonlyArray<string>): boolean {
  for (const ext of extensions) {
    if (name.endsWith(ext)) {
      return true;
    }
  }
  return false;
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

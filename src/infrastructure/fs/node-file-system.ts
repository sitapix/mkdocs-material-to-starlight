/**
 * Production adapter for the `FileSystem` port using `node:fs/promises`.
 *
 * The adapter is the only place in the codebase that imports `node:fs`. It
 * catches every exception that the standard library can throw and converts
 * them into typed `FileSystemError` values, so callers in `use-cases/` see a
 * uniform `Result` channel and never have to write `try`/`catch`.
 *
 * Imperative shell — keeps the I/O nucleus small and the use-case layer
 * pure. Any future filesystem (in-memory, S3, virtual workspace, sandboxed)
 * implements the same port without touching consumers.
 */

import { readFile, realpath, stat } from 'node:fs/promises';
import type { FileSystem, FileSystemError } from '../../domain/ports/file-system.js';
import { err, ok, type Result } from '../../domain/result.js';

export function createNodeFileSystem(): FileSystem {
  return {
    async readText(path: string): Promise<Result<string, FileSystemError>> {
      try {
        const content = await readFile(path, 'utf8');
        return ok(content);
      } catch (cause) {
        return err(translateError(cause, path));
      }
    },
    async exists(path: string): Promise<boolean> {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },
    async realpath(path: string): Promise<Result<string, FileSystemError>> {
      try {
        const resolved = await realpath(path);
        return ok(resolved);
      } catch (cause) {
        return err(translateError(cause, path));
      }
    },
  };
}

function translateError(cause: unknown, path: string): FileSystemError {
  if (!isErrnoLike(cause)) {
    return { code: 'unknown', path, message: 'unknown filesystem error' };
  }
  if (cause.code === 'ENOENT') {
    return { code: 'not-found', path, message: `file not found: ${path}` };
  }
  if (cause.code === 'EACCES' || cause.code === 'EISDIR' || cause.code === 'EPERM') {
    return {
      code: 'access-denied',
      path,
      message: `access denied: ${path} (${cause.code})`,
    };
  }
  return {
    code: 'unknown',
    path,
    message: `filesystem error reading ${path}: ${cause.code ?? 'unknown'}`,
  };
}

interface ErrnoLike {
  readonly code?: string;
}

function isErrnoLike(value: unknown): value is ErrnoLike {
  return typeof value === 'object' && value !== null && 'code' in value;
}

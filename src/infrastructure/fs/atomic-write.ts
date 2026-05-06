/**
 * Atomic text-file write: write to a sibling temp file, then rename onto the
 * target. `rename(2)` is atomic on the same filesystem, so a Ctrl-C, EIO,
 * EBUSY, or OOM mid-run cannot leave the target half-written — either the
 * old content is intact, or the new content is fully present. This is the
 * standard pattern documented in `npm/write-file-atomic` and the Node.js fs
 * docs.
 *
 * Use this for every output file the converter emits. `node:fs.writeFile`
 * direct is *not* atomic: if the process is interrupted between the open and
 * the close, the destination is truncated and partial.
 *
 * Returns a typed Result so callers don't write try/catch. Imperative shell —
 * the only direct importer of `node:fs/promises` for write paths.
 */

import { copyFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { err, ok, type Result } from '../../domain/result.js';

export async function atomicWriteText(
  target: string,
  content: string,
): Promise<Result<true, string>> {
  const tmp = makeTempPath(target);
  try {
    await mkdir(dirname(target), { recursive: true });
  } catch (cause) {
    return err(`failed to write ${target}: ${formatCause(cause)}`);
  }
  try {
    await writeFile(tmp, content, 'utf8');
  } catch (cause) {
    // We never created the tmp file successfully; nothing to clean up.
    return err(`failed to write ${target}: ${formatCause(cause)}`);
  }
  try {
    await rename(tmp, target);
    return ok(true);
  } catch (cause) {
    // Rename failed — best-effort tmp cleanup so we don't accumulate cruft.
    await unlink(tmp).catch(() => undefined);
    return err(`failed to write ${target}: ${formatCause(cause)}`);
  }
}

/**
 * Atomic file copy: copy source to a sibling temp of target, then rename.
 * Same atomicity guarantee as `atomicWriteText` — the destination is either
 * the previous content, or the new full content; never partial.
 */
export async function atomicCopyFile(
  source: string,
  target: string,
): Promise<Result<true, string>> {
  const tmp = makeTempPath(target);
  try {
    await mkdir(dirname(target), { recursive: true });
  } catch (cause) {
    return err(`failed to copy ${source} → ${target}: ${formatCause(cause)}`);
  }
  try {
    await copyFile(source, tmp);
  } catch (cause) {
    return err(`failed to copy ${source} → ${target}: ${formatCause(cause)}`);
  }
  try {
    await rename(tmp, target);
    return ok(true);
  } catch (cause) {
    await unlink(tmp).catch(() => undefined);
    return err(`failed to copy ${source} → ${target}: ${formatCause(cause)}`);
  }
}

function makeTempPath(target: string): string {
  // Sibling tmp on the same directory ⇒ same filesystem ⇒ rename is atomic.
  // pid + monotonic-ish timestamp + random keeps concurrent writers from
  // colliding even when called in a tight loop from the same process.
  const suffix = `.tmp.${String(process.pid)}.${String(Date.now())}.${String(Math.floor(Math.random() * 1e9))}`;
  return `${target}${suffix}`;
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return String(cause);
}

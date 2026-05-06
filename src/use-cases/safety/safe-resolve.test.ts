import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok } from '../../domain/result.js';
import { safeResolveWithin } from './safe-resolve.js';

function fakeFs(opts: {
  symlinkMap?: Record<string, string>;
  missing?: ReadonlyArray<string>;
}): FileSystem {
  const symlinks = opts.symlinkMap ?? {};
  const missing = new Set(opts.missing ?? []);
  return {
    async readText() {
      return err({ code: 'not-found', path: '', message: 'unused' });
    },
    async exists() {
      return true;
    },
    async realpath(path) {
      if (missing.has(path)) {
        return err({ code: 'not-found', path, message: `not found: ${path}` });
      }
      return ok(symlinks[path] ?? path);
    },
  };
}

describe('safeResolveWithin', () => {
  it('returns the canonical path for a candidate inside the base', async () => {
    const fs = fakeFs({});
    const result = await safeResolveWithin('/project/docs', '/project/docs/snippets/a.md', fs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('/project/docs/snippets/a.md');
    }
  });

  it('rejects a candidate that escapes the base after symlink resolution', async () => {
    // The on-disk path is /project/docs/secret-link, but it's a symlink
    // pointing at /etc/passwd. The base /project/docs realpaths to itself.
    const fs = fakeFs({
      symlinkMap: {
        '/project/docs/secret-link': '/etc/passwd',
      },
    });
    const result = await safeResolveWithin('/project/docs', '/project/docs/secret-link', fs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path-escapes-base');
    }
  });

  it('rejects a candidate that uses .. to traverse out of the base', async () => {
    // We pre-resolve the candidate; the realpath for both points outside.
    const fs = fakeFs({});
    const result = await safeResolveWithin('/project/docs', '/project/secret/file', fs);
    expect(result.ok).toBe(false);
  });

  it('returns base-not-resolvable when the base directory cannot be realpathed', async () => {
    const fs = fakeFs({ missing: ['/missing/base'] });
    const result = await safeResolveWithin('/missing/base', '/missing/base/file', fs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('base-not-resolvable');
    }
  });

  it('returns candidate-not-resolvable when the candidate itself cannot be realpathed', async () => {
    const fs = fakeFs({ missing: ['/project/docs/missing'] });
    const result = await safeResolveWithin('/project/docs', '/project/docs/missing', fs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('candidate-not-resolvable');
    }
  });

  it('accepts the base directory itself', async () => {
    const fs = fakeFs({});
    const result = await safeResolveWithin('/project/docs', '/project/docs', fs);
    expect(result.ok).toBe(true);
  });
});

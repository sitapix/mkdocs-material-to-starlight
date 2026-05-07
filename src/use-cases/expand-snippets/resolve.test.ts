import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok } from '../../domain/result.js';
import { resolveSnippet } from './resolve.js';

function makeFileSystem(files: Record<string, string>): FileSystem {
  return {
    async readText(path) {
      const content = files[path];
      if (content === undefined) {
        return err({ code: 'not-found', path, message: `not found: ${path}` });
      }
      return ok(content);
    },
    async exists(path) {
      return Object.hasOwn(files, path);
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

describe('resolveSnippet', () => {
  it('finds a snippet in the first base_path that contains it', async () => {
    const fs = makeFileSystem({
      'docs/snippets/intro.md': 'shared intro',
      'overrides/snippets/intro.md': 'override',
    });
    const result = await resolveSnippet({
      relativePath: 'snippets/intro.md',
      basePaths: ['overrides', 'docs'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.absolutePath).toBe('overrides/snippets/intro.md');
      expect(result.value.content).toBe('override');
    }
  });

  it('falls through to the next base_path when the first does not contain it', async () => {
    const fs = makeFileSystem({
      'docs/snippets/intro.md': 'shared intro',
    });
    const result = await resolveSnippet({
      relativePath: 'snippets/intro.md',
      basePaths: ['overrides', 'docs'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.absolutePath).toBe('docs/snippets/intro.md');
      expect(result.value.content).toBe('shared intro');
    }
  });

  it('returns a typed error when no base_path resolves the snippet', async () => {
    const fs = makeFileSystem({});
    const result = await resolveSnippet({
      relativePath: 'missing.md',
      basePaths: ['docs', 'overrides'],
      fs,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('snippet-not-found');
      expect(result.error.relativePath).toBe('missing.md');
      expect(result.error.searched).toEqual(['docs/missing.md', 'overrides/missing.md']);
    }
  });

  it('respects the order of basePaths exactly (first match wins)', async () => {
    const fs = makeFileSystem({
      'a/x.md': 'A',
      'b/x.md': 'B',
      'c/x.md': 'C',
    });
    const result = await resolveSnippet({
      relativePath: 'x.md',
      basePaths: ['b', 'a', 'c'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('B');
    }
  });

  it('returns an error if basePaths is empty', async () => {
    const fs = makeFileSystem({ 'x.md': 'X' });
    const result = await resolveSnippet({ relativePath: 'x.md', basePaths: [], fs });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('snippet-not-found');
      expect(result.error.searched).toEqual([]);
    }
  });
});

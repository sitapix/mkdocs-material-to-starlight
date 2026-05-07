import { describe, expect, it } from 'vitest';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import type { DirectoryReader } from '../../domain/ports/directory-reader.js';
import { err, ok } from '../../domain/result.js';
import { validateProjectPreflight } from './validate-project-preflight.js';

function fakeReader(map: Record<string, ReadonlyArray<string>>): DirectoryReader {
  return {
    list: async (root) => {
      const list = map[root];
      if (list === undefined) {
        return err({
          code: 'not-found' as const,
          path: root,
          message: `ENOENT: no such file or directory, scandir '${root}'`,
        });
      }
      return ok(list);
    },
  };
}

const baseConfig: MkdocsConfig = {
  siteName: 'Test',
  siteDescription: null,
  siteUrl: null,
  docsDir: 'docs',
  useDirectoryUrls: true,
  repoUrl: null,
  repoName: null,
  editUri: null,
  copyright: null,
  theme: null,
  nav: null,
  plugins: [],
  markdownExtensions: [],
  extras: {},
};

describe('validateProjectPreflight', () => {
  it('returns ok when docs_dir resolves and contains markdown', async () => {
    const reader = fakeReader({ '/p/docs': ['index.md', 'guide.md'] });
    const result = await validateProjectPreflight('/p', baseConfig, reader);
    expect(result.ok).toBe(true);
  });

  it('reports docs-dir-missing with the configured path when the directory is unreadable', async () => {
    const reader = fakeReader({}); // /p/docs not present
    const result = await validateProjectPreflight('/p', baseConfig, reader);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('docs-dir-missing');
    // The message must surface enough context for the user to see *what* path
    // failed, not just a bare ENOENT.
    expect(result.error.message).toMatch(/docs/);
  });

  it('reports docs-dir-empty when the directory exists but has no markdown', async () => {
    const reader = fakeReader({ '/p/docs': [] });
    const result = await validateProjectPreflight('/p', baseConfig, reader);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('docs-dir-empty');
    // Surfaces the configured docs_dir so the user knows where to look.
    expect(result.error.message).toContain('docs');
  });

  it('honors a custom docs_dir setting from the config', async () => {
    const cfg = { ...baseConfig, docsDir: 'content' };
    const reader = fakeReader({ '/p/content': ['index.md'] });
    const result = await validateProjectPreflight('/p', cfg, reader);
    expect(result.ok).toBe(true);
  });
});

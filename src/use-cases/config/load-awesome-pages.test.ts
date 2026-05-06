import { describe, expect, it } from 'vitest';
import { loadAwesomePagesFiles } from './load-awesome-pages.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { ok, err } from '../../domain/result.js';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';

function makeFs(files: Record<string, string>): FileSystem {
  return {
    async readText(path) {
      const content = files[path];
      if (content === undefined) {
        return err({ code: 'not-found', path, message: `not found: ${path}` });
      }
      return ok(content);
    },
    async exists(path) {
      return Object.prototype.hasOwnProperty.call(files, path);
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

describe('loadAwesomePagesFiles', () => {
  const yaml = createJsYamlDecoder();

  it('returns an empty map when no .pages files exist', async () => {
    const fs = makeFs({});
    const result = await loadAwesomePagesFiles({
      docsDir: 'docs',
      candidateDirectories: ['', 'api'],
      fs,
      yaml,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(0);
    }
  });

  it('parses a single .pages file at the given directory', async () => {
    const fs = makeFs({
      'docs/api/.pages': 'title: API Reference\n',
    });
    const result = await loadAwesomePagesFiles({
      docsDir: 'docs',
      candidateDirectories: ['api'],
      fs,
      yaml,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const config = result.value.get('api');
      expect(config?.title).toBe('API Reference');
    }
  });

  it('handles multiple directories with .pages files', async () => {
    const fs = makeFs({
      'docs/api/.pages': 'title: API\n',
      'docs/guide/.pages': 'title: Guide\n',
    });
    const result = await loadAwesomePagesFiles({
      docsDir: 'docs',
      candidateDirectories: ['api', 'guide', 'other'],
      fs,
      yaml,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.size).toBe(2);
      expect(result.value.get('api')?.title).toBe('API');
      expect(result.value.get('guide')?.title).toBe('Guide');
    }
  });

  it('treats malformed .pages files as errors', async () => {
    const fs = makeFs({
      'docs/api/.pages': 'this: is\n  : broken\n',
    });
    const result = await loadAwesomePagesFiles({
      docsDir: 'docs',
      candidateDirectories: ['api'],
      fs,
      yaml,
    });
    expect(result.ok).toBe(false);
  });

  it('uses an empty-string directory key for the root .pages', async () => {
    const fs = makeFs({
      'docs/.pages': 'title: Site Root\n',
    });
    const result = await loadAwesomePagesFiles({
      docsDir: 'docs',
      candidateDirectories: [''],
      fs,
      yaml,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.get('')?.title).toBe('Site Root');
    }
  });
});

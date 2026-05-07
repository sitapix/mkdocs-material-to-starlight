import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok } from '../../domain/result.js';
import { convertSite } from './convert.js';

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
      return Object.hasOwn(files, path);
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

describe('convertSite', () => {
  it('autolinks #N / @user / owner/repo#N when repoContext is provided', async () => {
    const fs = makeFs({
      'docs/index.md': 'See #123 and thanks @alice and cross-ref foo/bar#7.\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
      repoContext: {
        provider: 'github',
        owner: 'acme',
        repo: 'docs',
        baseUrl: 'https://github.com/acme/docs',
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const out = result.value.files['index.md'] ?? '';
      expect(out).toContain('https://github.com/acme/docs/issues/123');
      expect(out).toContain('https://github.com/alice');
      expect(out).toContain('https://github.com/foo/bar/issues/7');
    }
  });

  it('reports detected features (math, mermaid) across the site', async () => {
    const fs = makeFs({
      'docs/index.md': '# Welcome\n\nNo special content.\n',
      'docs/math.md': 'Energy: $$E = mc^2$$\n',
      'docs/diagram.md': '```mermaid\ngraph LR; A-->B\n```\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md', 'math.md', 'diagram.md'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.detectedFeatures).toContain('math');
      expect(result.value.detectedFeatures).toContain('mermaid');
    }
  });

  it('returns a per-file converted output for every listed source', async () => {
    const fs = makeFs({
      'docs/index.md': '# Welcome\n',
      'docs/api/auth.md': '# Auth\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md', 'api/auth.md'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value.files).sort()).toEqual(['api/auth.md', 'index.md']);
      // Body H1 stripped (matches synthesized title); title preserved in
      // frontmatter so Starlight still renders it.
      expect(result.value.files['index.md']).toContain('title: Welcome');
      expect(result.value.files['index.md']).not.toMatch(/^# Welcome\b/m);
      expect(result.value.files['api/auth.md']).toContain('title: Auth');
      expect(result.value.files['api/auth.md']).not.toMatch(/^# Auth\b/m);
    }
  });

  it('rewrites internal links across files using the site-wide slug map', async () => {
    const fs = makeFs({
      'docs/index.md': 'See [auth](api/auth.md).\n',
      'docs/api/auth.md': 'See [home](../index.md).\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md', 'api/auth.md'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files['index.md']).toContain('[auth](/api/auth)');
      expect(result.value.files['api/auth.md']).toContain('[home](/)');
    }
  });

  it('runs admonition normalization across files', async () => {
    const fs = makeFs({
      'docs/index.md': '!!! warning\n    Be careful.\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files['index.md']).toContain(':::caution');
    }
  });

  it('aggregates per-file diagnostics into a single tagged list', async () => {
    const fs = makeFs({
      'docs/index.md': 'See [missing](missing.md).\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.diagnostics).toHaveLength(1);
      expect(result.value.diagnostics[0]?.sourcePath).toBe('index.md');
      expect(result.value.diagnostics[0]?.diagnostic.ruleId).toBe('broken-link');
    }
  });

  it('resolves an X.md / X/index.md slug conflict by dropping the index.md sibling', async () => {
    // Pre-existing test re-purpose: the named .md vs directory-index.md
    // collision is a real Material section-index pattern (PowerTools, etc.)
    // where the directory's index is a thin snippet shim. The converter
    // drops the index.md and surfaces a warning so the build proceeds.
    const fs = makeFs({
      'docs/api.md': 'API content\n',
      'docs/api/index.md': '--8<-- "docs/api.md"\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['api.md', 'api/index.md'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The named sibling won — emitted at api.md, dropped sibling
      // emits a slug-conflict-resolved warning.
      expect(result.value.files['api.md']).toBeDefined();
      expect(result.value.files['api/index.md']).toBeUndefined();
      const warn = result.value.diagnostics.find(
        (d) => d.diagnostic.ruleId === 'slug-conflict-resolved',
      );
      expect(warn).toBeDefined();
      expect(warn?.sourcePath).toBe('api/index.md');
    }
  });

  it('returns a typed error if any file cannot be read', async () => {
    const fs = makeFs({});
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('file-read-failed');
    }
  });

  it('expands snippets when snippetBasePaths is supplied', async () => {
    const fs = makeFs({
      'docs/index.md': 'Pre.\n\n--8<-- "intro.md"\n\nPost.\n',
      'docs/intro.md': 'Inlined intro body.',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
      snippetBasePaths: ['docs'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const out = result.value.files['index.md'] ?? '';
      expect(out).toContain('Inlined intro body.');
      expect(out).not.toContain('--8<--');
    }
  });

  it('emits a snippet-not-found diagnostic when the snippet is missing', async () => {
    const fs = makeFs({
      'docs/index.md': '--8<-- "missing.md"\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
      snippetBasePaths: ['docs'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.value.diagnostics.some((d) => d.diagnostic.ruleId === 'snippet-not-found'),
      ).toBe(true);
    }
  });

  it('skips snippet expansion when snippetBasePaths is omitted', async () => {
    const fs = makeFs({
      'docs/index.md': '--8<-- "intro.md"\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.files['index.md']).toContain('--8<-- "intro.md"');
    }
  });

  it('resolves internal links between per-locale files to the Starlight directory layout', async () => {
    const fs = makeFs({
      'docs/page.fr.md': 'See [autre](other.fr.md) for details.\n',
      'docs/other.fr.md': '# Autre\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['page.fr.md', 'other.fr.md'],
      fs,
      i18nLocales: ['fr'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const out = result.value.files['fr/page.md'] ?? '';
      // The link target was `other.fr.md` in the source; after rename, the
      // slug for that file is `fr/other` so the rewriter emits `/fr/other`.
      expect(out).toContain('[autre](/fr/other)');
    }
  });

  it("renames per-locale source paths to Starlight's directory layout when i18nLocales is provided", async () => {
    const fs = makeFs({
      'docs/page.md': '# English\n',
      'docs/page.fr.md': '# Français\n',
      'docs/guides/intro.de.md': '# Einführung\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['page.md', 'page.fr.md', 'guides/intro.de.md'],
      fs,
      i18nLocales: ['fr', 'de'],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Default-locale file unchanged
      expect(result.value.files['page.md']).toBeDefined();
      // French file renamed
      expect(result.value.files['fr/page.md']).toBeDefined();
      expect(result.value.files['page.fr.md']).toBeUndefined();
      // German nested file renamed
      expect(result.value.files['de/guides/intro.md']).toBeDefined();
      expect(result.value.files['guides/intro.de.md']).toBeUndefined();
    }
  });

  it('appends autoAppendContent (Material site-wide glossary) to every page', async () => {
    const fs = makeFs({
      'docs/index.md': 'The HTML standard.\n',
      'docs/api.md': 'See HTML for context.\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md', 'api.md'],
      fs,
      autoAppendContent: '*[HTML]: Hyper Text Markup Language',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The abbreviation expansion runs on each file because the auto-append
      // line is appended before normalization.
      expect(result.value.files['index.md']).toContain(
        '<abbr title="Hyper Text Markup Language">HTML</abbr>',
      );
      expect(result.value.files['api.md']).toContain(
        '<abbr title="Hyper Text Markup Language">HTML</abbr>',
      );
    }
  });
});

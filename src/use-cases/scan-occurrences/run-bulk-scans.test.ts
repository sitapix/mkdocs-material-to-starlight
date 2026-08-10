import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok } from '../../domain/result.js';
import { type RunBulkScansInput, runBulkScans } from './run-bulk-scans.js';

function fileSystem(files: Readonly<Record<string, string>>): FileSystem {
  return {
    async readText(path) {
      return path in files
        ? ok(files[path] ?? '')
        : err({ code: 'not-found', path, message: 'missing' });
    },
    async exists(path) {
      return path in files;
    },
    async realpath(path) {
      return ok(path);
    },
  };
}

function baseInput(overrides: Partial<RunBulkScansInput> = {}): RunBulkScansInput {
  return {
    docsDir: '/project/docs',
    projectDir: '/project',
    fs: fileSystem({}),
    dirReader: {
      async list() {
        return ok([]);
      },
    },
    sourcePaths: [],
    plugins: [],
    markdownExtensions: [],
    hasTabsLink: false,
    extraCssPaths: [],
    extraJsPaths: [],
    ...overrides,
  };
}

describe('runBulkScans', () => {
  it('runs all enabled source and metadata scanners while skipping unreadable files', async () => {
    const fs = fileSystem({
      '/project/docs/page.md': [
        '=== "Install"',
        '    content',
        '',
        '```python linenums="1"',
        'print(1)',
        '```',
        '',
        '``` { .yaml .no-copy }',
        'key: value',
        '```',
        '',
        'Math: \\(x + y\\).',
      ].join('\n'),
      '/project/docs/guide/.meta.yml': 'title: Guide\n',
    });
    const diagnostics = await runBulkScans(
      baseInput({
        fs,
        sourcePaths: ['page.md', 'missing.md'],
        plugins: [{ name: 'meta', options: {} }],
        markdownExtensions: ['codehilite' as never],
        hasTabsLink: true,
        extraJsPaths: ['javascripts/mathjax.js'],
        dirReader: {
          async list() {
            return ok(['guide/.meta.yml', 'ordinary.yml', 'missing/.meta.yml']);
          },
        },
      }),
    );
    const rules = diagnostics.map((entry) => entry.diagnostic.ruleId);

    expect(rules).toEqual(
      expect.arrayContaining([
        'feature-tabs-link-occurrence',
        'extension-codehilite-linenums-occurrence',
        'plugin-meta-config-detected',
        'code-block-opt-out-dropped',
        'latex-delimiter-unsupported',
        'math-runtime-script-superseded',
      ]),
    );
  });

  it('handles object-form extensions and an unreadable metadata listing', async () => {
    const diagnostics = await runBulkScans(
      baseInput({
        markdownExtensions: [{ codehilite: {} } as never, {} as never],
        plugins: [{ name: 'meta', options: {} }],
        dirReader: {
          async list() {
            return err({ message: 'denied' });
          },
        },
      }),
    );

    expect(diagnostics).toEqual([]);
  });

  it('loads local CSS from docs first, then falls back to the project root', async () => {
    const fs = fileSystem({
      '/project/docs/styles/docs.css': ':root { --md-code-bg-color: black; }',
      '/project/styles/root.css': '.highlight .sb { color: red; }',
    });
    const diagnostics = await runBulkScans(
      baseInput({
        fs,
        extraCssPaths: [
          '/styles/docs.css',
          'styles/root.css',
          'styles/missing.css',
          'https://cdn.example.com/code.css',
        ],
      }),
    );

    expect(diagnostics.map((entry) => entry.sourcePath)).toEqual([
      'styles/docs.css',
      'styles/root.css',
    ]);
  });
});

/**
 * Integration test: the convert-site pipeline must surface a real
 * `output-syntax-error` diagnostic when the converted output contains
 * invalid MDX/Markdown. Uses a fake validator so the test runs without
 * @mdx-js/mdx installed.
 */
import { describe, expect, it } from 'vitest';
import type { FileSystem } from '../../src/domain/ports/file-system.js';
import type { OutputValidator } from '../../src/domain/ports/output-validator.js';
import { convertSite } from '../../src/use-cases/convert-site/convert.js';

function inMemoryFs(files: Readonly<Record<string, string>>): FileSystem {
  return {
    async readText(path: string) {
      const v = files[path];
      if (v === undefined) {
        return { ok: false, error: { code: 'not-found', message: path } } as const;
      }
      return { ok: true, value: v } as const;
    },
    async writeText() {
      return { ok: true, value: undefined } as const;
    },
    async ensureDir() {
      return { ok: true, value: undefined } as const;
    },
    async listFiles() {
      return { ok: true, value: [] } as const;
    },
    async stat() {
      return { ok: false, error: { code: 'not-found', message: 'stub' } } as const;
    },
  } as unknown as FileSystem;
}

const FAILING_VALIDATOR: OutputValidator = {
  async validate(_text, ext) {
    return {
      kind: 'failure',
      errors: [{ line: 5, column: 3, message: `synthetic ${ext} parse failure` }],
    };
  },
};

const OK_VALIDATOR: OutputValidator = {
  async validate() {
    return { kind: 'ok' };
  },
};

describe('convert-site output validation integration', () => {
  it('emits output-syntax-error when the validator reports failure', async () => {
    const fs = inMemoryFs({
      'docs/index.md': '# Hello\n\nA paragraph.\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
      outputValidator: FAILING_VALIDATOR,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const errs = result.value.diagnostics.filter(
      (d) => d.diagnostic.ruleId === 'output-syntax-error',
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]?.diagnostic.severity).toBe('error');
    expect(errs[0]?.diagnostic.place).toEqual({ line: 5, column: 3 });
    expect(errs[0]?.diagnostic.message).toContain('synthetic');
  });

  it('emits no output-syntax-error when validator reports ok', async () => {
    const fs = inMemoryFs({
      'docs/index.md': '# Hello\n\nA paragraph.\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
      outputValidator: OK_VALIDATOR,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const errs = result.value.diagnostics.filter(
      (d) => d.diagnostic.ruleId === 'output-syntax-error',
    );
    expect(errs).toEqual([]);
  });

  it('skips validation entirely when no validator is injected', async () => {
    const fs = inMemoryFs({
      'docs/index.md': '# Hello\n\nA paragraph.\n',
    });
    const result = await convertSite({
      docsDir: 'docs',
      sourcePaths: ['index.md'],
      fs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validationDiags = result.value.diagnostics.filter(
      (d) =>
        d.diagnostic.ruleId === 'output-syntax-error' ||
        d.diagnostic.ruleId === 'output-validator-unavailable',
    );
    expect(validationDiags).toEqual([]);
  });
});

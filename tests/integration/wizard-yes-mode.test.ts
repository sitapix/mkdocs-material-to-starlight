import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/interface/cli/main.js';

describe('--yes mode (non-interactive equivalent of wizard defaults)', () => {
  it('runs convert successfully against a minimal mkdocs project with --yes', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-yes-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: Test\n');
    writeFileSync(join(project, 'docs', 'index.md'), '# Hello\n');

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-out-'));
    const lines: string[] = [];
    const err: string[] = [];
    const exit = await runCli([project, out, '--yes'], {
      stdout: (l) => lines.push(l),
      stderr: (l) => err.push(l),
    });
    expect(exit).toBe(0);
    expect(() =>
      readFileSync(join(out, 'src', 'content', 'docs', 'index.md'), 'utf8'),
    ).not.toThrow();
  });
});

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/interface/cli/main.js';

describe('non-empty output dir', () => {
  function setup() {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-fo-p-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: T\n');
    writeFileSync(join(project, 'docs', 'index.md'), '# H\n');
    const out = mkdtempSync(join(tmpdir(), 'mk2sl-fo-o-'));
    writeFileSync(join(out, 'pre-existing.txt'), 'preserved');
    return { project, out };
  }

  it('fails non-interactively without --force', async () => {
    const { project, out } = setup();
    const err: string[] = [];
    const exit = await runCli([project, out, '--yes'], {
      stdout: () => {},
      stderr: (l) => err.push(l),
    });
    expect(exit).toBe(1);
    expect(err.join('\n')).toMatch(/--force/);
  });

  it('succeeds with --force', async () => {
    const { project, out } = setup();
    const exit = await runCli([project, out, '--yes', '--force'], {
      stdout: () => {},
      stderr: () => {},
    });
    expect(exit).toBe(0);
  });
});

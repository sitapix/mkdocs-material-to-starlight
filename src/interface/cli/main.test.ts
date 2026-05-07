import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from './main.js';

describe('runCli', () => {
  let projectDir: string;
  let outputDir: string;
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'mts-cli-proj-'));
    outputDir = mkdtempSync(join(tmpdir(), 'mts-cli-out-'));
    stdout = [];
    stderr = [];
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      'site_name: Demo\ndocs_dir: docs\nnav:\n  - Home: index.md\n',
    );
    writeFileSync(join(projectDir, 'docs', 'index.md'), '!!! warning\n    Be careful.\n');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
  });

  function makeIo() {
    return {
      stdout: (line: string) => stdout.push(line),
      stderr: (line: string) => stderr.push(line),
    };
  }

  it('prints help and exits 0 on --help', async () => {
    const code = await runCli(['--help'], makeIo());
    expect(code).toBe(0);
    expect(stdout.join('\n')).toMatch(/usage|convert/i);
  });

  it('prints version and exits 0 on --version', async () => {
    const code = await runCli(['--version'], makeIo());
    expect(code).toBe(0);
    expect(stdout.join('\n').trim().length).toBeGreaterThan(0);
  });

  it('exits 2 with a usage message on zero args in non-interactive env', async () => {
    const code = await runCli([], makeIo());
    expect(code).toBe(2);
    // In CI/non-TTY environments the wizard branch fires and directs the user
    // to either pass --yes or use a terminal.
    expect(stderr.join('\n')).toMatch(/--yes|missing/i);
  });

  it('converts a project end-to-end and exits 0', async () => {
    const code = await runCli([projectDir, outputDir], makeIo());
    expect(code).toBe(0);
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'astro.config.mjs'))).toBe(true);
    expect(existsSync(join(outputDir, 'package.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'MIGRATION_NOTES.md'))).toBe(true);
  });

  it('exits 1 when conversion fails (missing mkdocs.yml)', async () => {
    rmSync(join(projectDir, 'mkdocs.yml'));
    const code = await runCli([projectDir, outputDir], makeIo());
    expect(code).toBe(1);
    expect(stderr.join('\n')).toMatch(/config-not-found|mkdocs\.yml/);
  });

  it('reports diagnostics to stdout on success even when there are warnings', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), 'See [missing](missing.md).\n');
    const code = await runCli([projectDir, outputDir], makeIo());
    expect(code).toBe(0);
    expect(stdout.join('\n')).toMatch(/broken-link/);
  });

  it('exits 1 when conversion produces an error-severity diagnostic', async () => {
    // Real regression: before email-autolink and other sanitizer fixes, a
    // file could be promoted to .mdx and then fail MDX parsing, producing
    // an `output-syntax-error` diagnostic with `severity: 'error'`. The CLI
    // used to print the report and exit 0, hiding the broken output from
    // CI. Force a parse error by importing a Starlight component (forces
    // MDX) and leaving an unclosed JSX-shaped tag the sanitizer can't
    // safely escape.
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      [
        "import { Aside } from '@astrojs/starlight/components';",
        '',
        '# Title',
        '',
        '<Aside>oops never closed',
        '',
      ].join('\n'),
    );
    const code = await runCli([projectDir, outputDir], makeIo());
    expect(code).toBe(1);
    expect(stdout.join('\n')).toMatch(/error/);
  });

  it('prints a per-feature explanation on --explain without writing files', async () => {
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'nav:',
        '  - Home: index.md',
        'markdown_extensions:',
        '  - admonition',
        '  - pymdownx.details',
        '  - footnotes',
        '',
      ].join('\n'),
    );
    const code = await runCli([projectDir, '--explain'], makeIo());
    expect(code).toBe(0);
    const out = stdout.join('\n');
    // Should mention the enabled features by their featureId.
    expect(out).toMatch(/admonition-block/);
    expect(out).toMatch(/admonition-collapsible/);
    expect(out).toMatch(/footnotes/);
    // Should not write any files.
    expect(existsSync(join(outputDir, 'astro.config.mjs'))).toBe(false);
    expect(existsSync(join(outputDir, 'package.json'))).toBe(false);
  });

  it('runs astro check when --check is set and reports its diagnostics on stdout', async () => {
    const code = await runCli([projectDir, outputDir, '--check'], makeIo(), {
      processRunner: {
        async run() {
          return {
            ok: true,
            value: {
              exitCode: 1,
              stdout: 'src/content/docs/index.md:1:1 - Error: bogus content schema field.\n',
              stderr: '',
              timedOut: false,
            },
          };
        },
      },
    });
    expect(code).toBe(1);
    expect(stdout.join('\n')).toMatch(/astro-check-error/);
  });

  it('does not run astro check when --check is omitted', async () => {
    let invoked = false;
    const code = await runCli([projectDir, outputDir], makeIo(), {
      processRunner: {
        async run() {
          invoked = true;
          return {
            ok: true,
            value: { exitCode: 0, stdout: '', stderr: '', timedOut: false },
          };
        },
      },
    });
    expect(code).toBe(0);
    expect(invoked).toBe(false);
  });

  it('exits 0 with --check when astro check is clean', async () => {
    const code = await runCli([projectDir, outputDir, '--check'], makeIo(), {
      processRunner: {
        async run() {
          return {
            ok: true,
            value: {
              exitCode: 0,
              stdout: '0 errors, 0 warnings, 0 hints.',
              stderr: '',
              timedOut: false,
            },
          };
        },
      },
    });
    expect(code).toBe(0);
  });

  it('runs visual-diff compare with injected fakes and prints the report', async () => {
    const fakeBrowser = {
      async capture() {
        return {
          ok: true as const,
          value: new Uint8Array([0]),
        };
      },
    };
    const fakeDiffer = {
      async diff() {
        return {
          ok: true as const,
          value: { mismatchedPixels: 0, width: 100, height: 100 },
        };
      },
    };
    const code = await runCli(
      ['compare', 'http://baseline', 'http://converted', '--pages', '/'],
      makeIo(),
      { browserAutomator: fakeBrowser, imageDiffer: fakeDiffer },
    );
    expect(code).toBe(0);
    expect(stdout.join('\n')).toContain('# Visual Diff Report');
    expect(stdout.join('\n')).toContain('matched: 1 / 1');
  });

  it('exits 1 from compare when any page mismatches', async () => {
    const fakeBrowser = {
      async capture() {
        return { ok: true as const, value: new Uint8Array([0]) };
      },
    };
    const fakeDiffer = {
      async diff() {
        return {
          ok: true as const,
          value: { mismatchedPixels: 5000, width: 100, height: 100 },
        };
      },
    };
    const code = await runCli(
      ['compare', 'http://b', 'http://c', '--pages', '/,about', '--threshold', '0.01'],
      makeIo(),
      { browserAutomator: fakeBrowser, imageDiffer: fakeDiffer },
    );
    expect(code).toBe(1);
  });

  it('expands snippets when --snippet-base-path is supplied', async () => {
    mkdirSync(join(projectDir, 'docs', 'snippets'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'snippets', 'foo.md'), 'inlined body');
    writeFileSync(join(projectDir, 'docs', 'index.md'), '--8<-- "snippets/foo.md"\n');
    const code = await runCli([projectDir, outputDir, '--snippet-base-path', 'docs'], makeIo());
    expect(code).toBe(0);
    const indexOut = require('node:fs').readFileSync(
      join(outputDir, 'src', 'content', 'docs', 'index.md'),
      'utf8',
    );
    expect(indexOut).toContain('inlined body');
    expect(indexOut).not.toContain('--8<--');
  });
});

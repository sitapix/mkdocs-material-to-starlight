import { describe, expect, it } from 'vitest';
import { formatEquivalentCommand } from './format-equivalent-command.js';

describe('formatEquivalentCommand', () => {
  it('renders short commands on a single line for easy copy-paste', () => {
    const out = formatEquivalentCommand(['./p', './o']);
    expect(out).toBe('mkdocs-material-to-starlight ./p ./o');
    expect(out.split('\n').length).toBe(1);
  });

  it('keeps the binary name on the first line when wrapping', () => {
    const longArgv = [
      './my-project',
      './my-output',
      '--check',
      '--package-manager=pnpm',
      '--tabs=html',
      '--no-links-validator',
      '--config-format=ts',
    ];
    const out = formatEquivalentCommand(longArgv);
    const lines = out.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toMatch(/^mkdocs-material-to-starlight/);
  });

  it('uses POSIX backslash-newline continuation so the multi-line form is shell-pasteable', () => {
    const longArgv = [
      './my-project',
      './my-output',
      '--check',
      '--package-manager=pnpm',
      '--tabs=html',
      '--no-links-validator',
      '--config-format=ts',
    ];
    const out = formatEquivalentCommand(longArgv);
    const lines = out.split('\n');
    // Every line except the last ends with ` \`.
    for (let i = 0; i < lines.length - 1; i++) {
      expect(lines[i]).toMatch(/\s\\$/);
    }
    // The last line does NOT end with a backslash.
    expect(lines[lines.length - 1]).not.toMatch(/\\$/);
  });

  it('threshold for wrapping is around 80 chars', () => {
    // Just over 80 once binary + spaces are counted → wraps.
    const out = formatEquivalentCommand([
      './long-project-name',
      './long-output-name',
      '--package-manager=pnpm',
      '--tabs=html',
    ]);
    expect(out.split('\n').length).toBeGreaterThan(1);
  });

  it('honors a custom binary name', () => {
    const out = formatEquivalentCommand(['./p', './o'], 'my-cli');
    expect(out).toMatch(/^my-cli/);
  });

  it('applies an optional binary highlighter so the command itself can pop in a TTY', () => {
    const out = formatEquivalentCommand(['./p', './o'], 'my-cli', {
      binary: (s) => `<<${s}>>`,
    });
    expect(out).toContain('<<my-cli>>');
    expect(out).toContain('./p');
    expect(out).not.toContain('<<./p>>');
  });

  it('falls back to identity when no highlighter is provided', () => {
    const out = formatEquivalentCommand(['./p', './o'], 'my-cli');
    expect(out).not.toContain('<<');
  });
});

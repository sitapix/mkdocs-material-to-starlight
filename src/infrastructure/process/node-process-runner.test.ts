import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createNodeProcessRunner } from './node-process-runner.js';

describe('createNodeProcessRunner', () => {
  it('captures stdout from a successful command', async () => {
    const runner = createNodeProcessRunner();
    const result = await runner.run('node', ['-e', 'process.stdout.write("hello")'], {
      cwd: tmpdir(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(0);
      expect(result.value.stdout).toBe('hello');
      expect(result.value.timedOut).toBe(false);
    }
  });

  it('captures stderr and exit code from a failing command', async () => {
    const runner = createNodeProcessRunner();
    const result = await runner.run(
      'node',
      ['-e', 'process.stderr.write("oops"); process.exit(2)'],
      { cwd: tmpdir() },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exitCode).toBe(2);
      expect(result.value.stderr).toBe('oops');
    }
  });

  it('returns spawn-failed when the binary does not exist', async () => {
    const runner = createNodeProcessRunner();
    const result = await runner.run('this-binary-definitely-does-not-exist-xyzzy', [], {
      cwd: tmpdir(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['not-found', 'spawn-failed', 'unknown']).toContain(result.error.code);
      expect(result.error.command).toBe('this-binary-definitely-does-not-exist-xyzzy');
    }
  });

  it('reports timedOut when the timeout fires before the process exits', async () => {
    const runner = createNodeProcessRunner();
    const result = await runner.run('node', ['-e', 'setTimeout(() => {}, 5000)'], {
      cwd: tmpdir(),
      timeoutMs: 100,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timedOut).toBe(true);
    }
  });
});

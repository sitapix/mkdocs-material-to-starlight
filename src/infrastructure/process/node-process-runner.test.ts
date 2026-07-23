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

  it('settles at the timeout even when a grandchild outlives the kill holding the pipes', async () => {
    // Regression: `npx astro check` spawns the real tool as a grandchild.
    // Killing only the direct child left the grandchild holding stdout/
    // stderr open, so 'close' — and therefore the returned promise —
    // waited for the ORPHAN to exit, historically doubling the wall time
    // past the configured timeout. The group kill + pipe teardown must
    // bound the wait at the timeout, give or take scheduling.
    const runner = createNodeProcessRunner();
    const t0 = Date.now();
    const result = await runner.run('sh', ['-c', '(sleep 5; echo orphan-lived) & exec sleep 100'], {
      cwd: tmpdir(),
      timeoutMs: 300,
    });
    const elapsed = Date.now() - t0;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timedOut).toBe(true);
      // Post-kill orphan output must not leak into the captured stream.
      expect(result.value.stdout).not.toContain('orphan-lived');
    }
    expect(elapsed).toBeLessThan(3000);
  });

  it('snapshots silenceMs at the kill, not at stream close', async () => {
    const runner = createNodeProcessRunner();
    const result = await runner.run(
      'node',
      ['-e', 'process.stdout.write("x"); setTimeout(() => {}, 5000)'],
      { cwd: tmpdir(), timeoutMs: 400 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timedOut).toBe(true);
      // Output at t≈0, kill at t≈400 → the silent gap is ~400ms; anything
      // wildly larger means it was measured after the kill.
      expect(result.value.silenceMs).toBeGreaterThan(100);
      expect(result.value.silenceMs).toBeLessThan(2000);
    }
  });

  it('gives children EOF on stdin so interactive prompts cannot wait forever', async () => {
    // Regression: astro check's "npm i @astrojs/check — Continue?" prompt
    // sat on a silent open stdin pipe for the entire timeout. With stdin
    // ignored, a child that reads stdin sees EOF immediately.
    const runner = createNodeProcessRunner();
    const t0 = Date.now();
    const result = await runner.run(
      'node',
      [
        '-e',
        'process.stdin.on("data", () => {}); process.stdin.on("end", () => { console.log("eof"); process.exit(0); }); process.stdin.on("error", () => { console.log("eof"); process.exit(0); });',
      ],
      { cwd: tmpdir(), timeoutMs: 5000 },
    );
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timedOut).toBe(false);
      expect(result.value.stdout).toContain('eof');
    }
  });
});

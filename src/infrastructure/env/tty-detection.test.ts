import { describe, expect, it } from 'vitest';
import { resolveInteractivity } from './tty-detection.js';

describe('resolveInteractivity — color', () => {
  it('honors --no-color over everything', () => {
    const r = resolveInteractivity({
      flags: { color: false },
      env: { FORCE_COLOR: '1', NO_COLOR: undefined, CI: undefined },
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.color).toBe(false);
  });

  it('honors --color over env', () => {
    const r = resolveInteractivity({
      flags: { color: true },
      env: { NO_COLOR: '1', FORCE_COLOR: undefined, CI: undefined },
      stdoutIsTTY: false,
      stdinIsTTY: false,
    });
    expect(r.color).toBe(true);
  });

  it('respects FORCE_COLOR when no flag set', () => {
    const r = resolveInteractivity({
      flags: {},
      env: { FORCE_COLOR: '1', NO_COLOR: undefined, CI: undefined },
      stdoutIsTTY: false,
      stdinIsTTY: false,
    });
    expect(r.color).toBe(true);
  });

  it('respects NO_COLOR when no flag set', () => {
    const r = resolveInteractivity({
      flags: {},
      env: { NO_COLOR: '1', FORCE_COLOR: undefined, CI: undefined },
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.color).toBe(false);
  });

  it('falls back to TTY when no flag/env', () => {
    const r = resolveInteractivity({
      flags: {},
      env: { NO_COLOR: undefined, FORCE_COLOR: undefined, CI: undefined },
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.color).toBe(true);
  });
});

describe('resolveInteractivity — interactive', () => {
  it('--no-interactive forces off even on TTY', () => {
    const r = resolveInteractivity({
      flags: { noInteractive: true },
      env: {},
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.interactive).toBe(false);
  });

  it('--ci implies non-interactive', () => {
    const r = resolveInteractivity({
      flags: { ci: true },
      env: {},
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.interactive).toBe(false);
  });

  it('CI=1 env implies non-interactive', () => {
    const r = resolveInteractivity({
      flags: {},
      env: { CI: '1' },
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.interactive).toBe(false);
  });

  it('TTY both directions ⇒ interactive', () => {
    const r = resolveInteractivity({
      flags: {},
      env: {},
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.interactive).toBe(true);
  });

  it('stdin not a TTY ⇒ non-interactive', () => {
    const r = resolveInteractivity({
      flags: {},
      env: {},
      stdoutIsTTY: true,
      stdinIsTTY: false,
    });
    expect(r.interactive).toBe(false);
  });
});

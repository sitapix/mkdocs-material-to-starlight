/**
 * Resolve whether to run interactively and whether to emit color, given the
 * CLI flags + env vars + TTY state. Pure: caller passes everything explicitly.
 *
 * Precedence:
 *   1. Explicit CLI flag
 *   2. Env var (NO_COLOR, FORCE_COLOR, CI)
 *   3. TTY detection
 */

interface InteractivityFlags {
  readonly noInteractive?: boolean;
  readonly ci?: boolean;
  readonly color?: boolean;
}

export interface InteractivityInput {
  readonly flags: InteractivityFlags;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdoutIsTTY: boolean;
  readonly stdinIsTTY: boolean;
}

export interface InteractivityDecision {
  readonly interactive: boolean;
  readonly color: boolean;
}

export function resolveInteractivity(input: InteractivityInput): InteractivityDecision {
  const { flags, env, stdoutIsTTY, stdinIsTTY } = input;

  const interactive = (() => {
    if (flags.noInteractive === true) return false;
    if (flags.ci === true) return false;
    if (env.CI !== undefined && env.CI !== '') return false;
    return stdoutIsTTY && stdinIsTTY;
  })();

  const color = (() => {
    if (flags.color === false) return false;
    if (flags.color === true) return true;
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
    if (env.NO_COLOR !== undefined) return false;
    return stdoutIsTTY;
  })();

  return { interactive, color };
}

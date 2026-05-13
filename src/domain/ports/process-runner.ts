/**
 * ProcessRunner port — the boundary every use-case crosses to spawn an
 * external process. Concrete implementations live in `infrastructure/process`;
 * tests inject in-memory fakes that return canned output.
 *
 * Pure declaration: no I/O lives here. Use-cases consume the port as a
 * function parameter, never reach for `node:child_process`, and therefore
 * stay testable without a live shell or installed Node toolchain.
 *
 * Operations are async because real implementations need to be. Failures are
 * returned as `Result`, never thrown — the I/O boundary is the one place
 * where exceptions might originate (from a third-party library), and the
 * adapter is responsible for converting them into `Result.err`.
 *
 * The runner deliberately does not stream stdout/stderr; it returns the
 * captured output once the process exits. Long-running processes are out of
 * scope (the only consumer today is `astro check`, which terminates on its
 * own).
 */

import type { Result } from '../result.js';

export interface ProcessRunOptions {
  /** Working directory for the spawned process. */
  readonly cwd: string;
  /** Environment variables; merged on top of the inherited environment. */
  readonly env?: Readonly<Record<string, string>>;
  /** Hard wall-clock limit in milliseconds. The process is killed on overrun. */
  readonly timeoutMs?: number;
}

export interface ProcessOutput {
  /** Exit code; null when the process was killed by a signal or timeout. */
  readonly exitCode: number | null;
  /** Captured standard output, decoded as UTF-8. */
  readonly stdout: string;
  /** Captured standard error, decoded as UTF-8. */
  readonly stderr: string;
  /** True when the runner aborted the process for exceeding `timeoutMs`. */
  readonly timedOut: boolean;
  /**
   * Milliseconds between the child's last stdout/stderr emission and the
   * process exit (or kill). Undefined when the runner did not track it.
   *
   * Callers use this to tell "still emitting output at exit" from "went
   * silent before exit". The caller decides what counts as long and what
   * action to recommend.
   */
  readonly silenceMs?: number;
}

export interface ProcessRunnerError {
  readonly code: 'not-found' | 'spawn-failed' | 'unknown';
  readonly command: string;
  readonly message: string;
}

export interface ProcessRunner {
  /**
   * Spawn `command` with the given arguments, wait for it to exit, and return
   * the captured output. Non-zero exit codes are *not* errors — they are
   * normal data on `ProcessOutput.exitCode`. The error channel is reserved
   * for cases where the process could not be spawned at all (binary missing,
   * permission denied, etc.).
   */
  run(
    command: string,
    args: ReadonlyArray<string>,
    options: ProcessRunOptions,
  ): Promise<Result<ProcessOutput, ProcessRunnerError>>;
}

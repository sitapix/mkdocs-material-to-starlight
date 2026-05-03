/**
 * Production adapter for the `ProcessRunner` port using `node:child_process`.
 *
 * The adapter is the only place in the codebase that imports
 * `node:child_process`. It catches every exception that the standard library
 * can throw at spawn time and converts them into typed `ProcessRunnerError`
 * values, so callers in `use-cases/` see a uniform `Result` channel.
 *
 * Imperative shell — keeps the I/O nucleus small and the use-case layer
 * pure. Any future runner (mock, Docker exec, remote SSH) implements the same
 * port without touching consumers.
 */

import { spawn } from 'node:child_process';
import { ok, err, type Result } from '../../domain/result.js';
import type {
  ProcessOutput,
  ProcessRunOptions,
  ProcessRunner,
  ProcessRunnerError,
} from '../../domain/ports/process-runner.js';

export function createNodeProcessRunner(): ProcessRunner {
  return {
    run(command, args, options) {
      return new Promise<Result<ProcessOutput, ProcessRunnerError>>((resolve) => {
        let child;
        try {
          child = spawn(command, [...args], buildSpawnOptions(options));
        } catch (cause) {
          resolve(err(translateSpawnError(cause, command)));
          return;
        }

        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let timer: NodeJS.Timeout | null = null;

        if (options.timeoutMs !== undefined) {
          timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, options.timeoutMs);
        }

        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.stderr?.on('data', (chunk: string) => {
          stderr += chunk;
        });

        child.on('error', (cause: Error) => {
          if (timer !== null) clearTimeout(timer);
          resolve(err(translateSpawnError(cause, command)));
        });

        child.on('close', (code: number | null) => {
          if (timer !== null) clearTimeout(timer);
          resolve(
            ok<ProcessOutput>({
              exitCode: timedOut ? null : code,
              stdout,
              stderr,
              timedOut,
            }),
          );
        });
      });
    },
  };
}

function buildSpawnOptions(options: ProcessRunOptions): {
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const env =
    options.env === undefined
      ? { ...process.env }
      : { ...process.env, ...options.env };
  return { cwd: options.cwd, env };
}

function translateSpawnError(cause: unknown, command: string): ProcessRunnerError {
  if (!isErrnoLike(cause)) {
    return {
      code: 'unknown',
      command,
      message: cause instanceof Error ? cause.message : 'unknown spawn error',
    };
  }
  if (cause.code === 'ENOENT') {
    return {
      code: 'not-found',
      command,
      message: `command not found: ${command}`,
    };
  }
  return {
    code: 'spawn-failed',
    command,
    message: `spawn failed for ${command}: ${cause.code ?? 'unknown'}`,
  };
}

interface ErrnoLike {
  readonly code?: string;
}

function isErrnoLike(value: unknown): value is ErrnoLike {
  return typeof value === 'object' && value !== null && 'code' in value;
}

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
import type {
  ProcessOutput,
  ProcessRunner,
  ProcessRunnerError,
  ProcessRunOptions,
} from '../../domain/ports/process-runner.js';
import { err, ok, type Result } from '../../domain/result.js';

export function createNodeProcessRunner(): ProcessRunner {
  return {
    run(command, args, options) {
      return new Promise<Result<ProcessOutput, ProcessRunnerError>>((resolve) => {
        let child: ReturnType<typeof spawn>;
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
        let lastOutputAt = Date.now();
        // Snapshot of the silent gap AT the kill, not at stream close: an
        // orphaned grandchild can keep writing after the kill, and 'close'
        // can fire much later — both would corrupt the hang/slow verdict
        // the timeout diagnostic builds from this number.
        let silenceAtKill: number | null = null;
        let settled = false;
        const settle = (result: Result<ProcessOutput, ProcessRunnerError>): void => {
          if (settled) return;
          settled = true;
          if (timer !== null) clearTimeout(timer);
          resolve(result);
        };

        if (options.timeoutMs !== undefined) {
          timer = setTimeout(() => {
            timedOut = true;
            silenceAtKill = Date.now() - lastOutputAt;
            killTree(child);
            // Drop our read ends of the pipes. A grandchild that survived
            // the kill (e.g. `npx` dead, its spawned tool alive) would
            // otherwise hold them open and defer 'close' — historically
            // past the timeout for as long as the orphan lived.
            child.stdout?.destroy();
            child.stderr?.destroy();
          }, options.timeoutMs);
        }

        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
          stdout += chunk;
          lastOutputAt = Date.now();
        });
        child.stderr?.on('data', (chunk: string) => {
          stderr += chunk;
          lastOutputAt = Date.now();
        });

        child.on('error', (cause: Error) => {
          settle(err(translateSpawnError(cause, command)));
        });

        const finish = (code: number | null): void => {
          settle(
            ok<ProcessOutput>({
              exitCode: timedOut ? null : code,
              stdout,
              stderr,
              timedOut,
              silenceMs: silenceAtKill ?? Date.now() - lastOutputAt,
            }),
          );
        };
        child.on('close', (code: number | null) => {
          finish(code);
        });
        // Fallback: with the pipes destroyed on timeout, 'close' fires
        // promptly — but if a platform quirk keeps a stream half-open,
        // 'exit' guarantees the promise still settles at the timeout
        // boundary instead of hanging on stdio.
        child.on('exit', (code: number | null) => {
          if (timedOut) finish(code);
        });
      });
    },
  };
}

function buildSpawnOptions(options: ProcessRunOptions): {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: ['ignore', 'pipe', 'pipe'];
  detached: boolean;
} {
  const env = options.env === undefined ? { ...process.env } : { ...process.env, ...options.env };
  return {
    cwd: options.cwd,
    env,
    // stdin 'ignore': children see EOF instead of an open, never-written
    // pipe. Any tool that tries to prompt interactively (astro check's
    // "npm i @astrojs/check — Continue?") fails fast instead of waiting
    // silently for the whole timeout.
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group (POSIX) so a timeout kill can take out the whole
    // tree — `npx` wrappers spawn the real tool as a grandchild, and
    // killing only the wrapper used to leave that tool running.
    detached: process.platform !== 'win32',
  };
}

/** Kill the child's whole process group; fall back to a direct kill where
 *  group signalling is unavailable (Windows, or the group is already gone). */
function killTree(child: {
  readonly pid?: number | undefined;
  kill(signal: NodeJS.Signals): boolean;
}): void {
  if (child.pid !== undefined && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch {
      // Group already reaped or not a group leader — fall through.
    }
  }
  child.kill('SIGKILL');
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

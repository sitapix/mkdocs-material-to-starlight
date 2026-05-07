import { describe, expect, it } from 'vitest';
import type {
  ProcessOutput,
  ProcessRunner,
  ProcessRunnerError,
  ProcessRunOptions,
} from '../../domain/ports/process-runner.js';
import type { Result } from '../../domain/result.js';
import { err, ok } from '../../domain/result.js';
import { runAstroCheck } from './run-astro-check.js';

interface FakeOptions {
  readonly result?: Result<ProcessOutput, ProcessRunnerError>;
  readonly capture?: { command?: string; args?: string[]; options?: ProcessRunOptions };
}

function fakeRunner(opts: FakeOptions = {}): ProcessRunner {
  return {
    async run(command, args, options) {
      if (opts.capture !== undefined) {
        opts.capture.command = command;
        opts.capture.args = [...args];
        opts.capture.options = options;
      }
      return (
        opts.result ??
        ok<ProcessOutput>({
          exitCode: 0,
          stdout: '',
          stderr: '',
          timedOut: false,
        })
      );
    },
  };
}

describe('runAstroCheck', () => {
  it('returns no diagnostics when astro check exits cleanly', async () => {
    const runner = fakeRunner({
      result: ok({
        exitCode: 0,
        stdout: '0 errors, 0 warnings, 0 hints.',
        stderr: '',
        timedOut: false,
      }),
    });
    const diagnostics = await runAstroCheck({ runner, outputDir: '/out' });
    expect(diagnostics).toEqual([]);
  });

  it('returns parsed diagnostics when astro check reports an error', async () => {
    const runner = fakeRunner({
      result: ok({
        exitCode: 1,
        stdout: 'src/content/docs/index.md:1:1 - Error: Missing field "title".\n',
        stderr: '',
        timedOut: false,
      }),
    });
    const diagnostics = await runAstroCheck({ runner, outputDir: '/out' });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('astro-check-error');
  });

  it('invokes astro check via npx in the provided outputDir', async () => {
    const capture: { command?: string; args?: string[]; options?: ProcessRunOptions } = {};
    const runner = fakeRunner({ capture });
    await runAstroCheck({ runner, outputDir: '/converted/site' });
    expect(capture.command).toBe('npx');
    expect(capture.args).toEqual(['--yes', 'astro', 'check']);
    expect(capture.options?.cwd).toBe('/converted/site');
  });

  it('forwards a custom timeout to the runner', async () => {
    const capture: { command?: string; args?: string[]; options?: ProcessRunOptions } = {};
    const runner = fakeRunner({ capture });
    await runAstroCheck({ runner, outputDir: '/out', timeoutMs: 60000 });
    expect(capture.options?.timeoutMs).toBe(60000);
  });

  it('emits astro-check-spawn-failed when the runner cannot spawn the process', async () => {
    const runner = fakeRunner({
      result: err({
        code: 'not-found',
        command: 'npx',
        message: 'npx not found on PATH',
      }),
    });
    const diagnostics = await runAstroCheck({ runner, outputDir: '/out' });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('astro-check-spawn-failed');
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.message).toContain('npx not found on PATH');
  });

  it('emits astro-check-not-installed when output indicates astro is missing', async () => {
    const runner = fakeRunner({
      result: ok({
        exitCode: 1,
        stdout: '',
        stderr: 'npm ERR! could not determine executable to run\n',
        timedOut: false,
      }),
    });
    const diagnostics = await runAstroCheck({ runner, outputDir: '/out' });
    const not_installed = diagnostics.find((d) => d.ruleId === 'astro-check-not-installed');
    expect(not_installed).toBeDefined();
    // The user opted in to `--check`; if we can't run it, that's a failed
    // contract and must surface as exit 1 (severity: error), not a silent
    // pass with a warning.
    expect(not_installed?.severity).toBe('error');
  });

  it('ignores npm install noise on the success path', async () => {
    const runner = fakeRunner({
      result: ok({
        exitCode: 0,
        stdout:
          'added 312 packages in 14s\n\nGetting diagnostics for Astro files...\n0 errors, 0 warnings, 0 hints.\n',
        stderr: 'npm warn deprecated foo@1.0.0: use bar instead\n',
        timedOut: false,
      }),
    });
    const diagnostics = await runAstroCheck({ runner, outputDir: '/out' });
    expect(diagnostics).toEqual([]);
  });

  it('emits astro-check-not-installed when npx canceled due to missing packages and no YES option', async () => {
    const runner = fakeRunner({
      result: ok({
        exitCode: 1,
        stdout: '',
        stderr:
          'npm error npx canceled due to missing packages and no YES option: ["astro@6.3.0"]\n',
        timedOut: false,
      }),
    });
    const diagnostics = await runAstroCheck({ runner, outputDir: '/out' });
    expect(diagnostics.some((d) => d.ruleId === 'astro-check-not-installed')).toBe(true);
  });

  it('returns the timeout diagnostic when the runner reports a timeout', async () => {
    const runner = fakeRunner({
      result: ok({
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: true,
      }),
    });
    const diagnostics = await runAstroCheck({ runner, outputDir: '/out' });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('astro-check-timeout');
  });
});

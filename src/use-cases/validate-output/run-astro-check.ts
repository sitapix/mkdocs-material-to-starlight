/**
 * Build-validation use-case: invoke `astro check` against the converted site
 * and translate its output into typed `Diagnostic`s.
 *
 * The use-case stays pure of `node:child_process`; it composes the injected
 * `ProcessRunner` port (so tests use a fake runner) with the pure
 * `parseAstroCheckOutput` parser.
 *
 * Failure modes:
 *   - Spawn failure (npx/astro not on PATH)        → astro-check-spawn-failed
 *   - npx-cannot-find-astro stderr signature       → astro-check-not-installed
 *   - Timeout                                      → astro-check-timeout
 *   - Parsed diagnostics from output               → astro-check-error/warning/hint
 *   - Non-zero exit with unparseable output        → astro-check-unparsed-output
 */

import type { Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { ProcessRunner } from '../../domain/ports/process-runner.js';
import { parseAstroCheckOutput } from './astro-check-parser.js';

const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const SOURCE = 'validate-output/run-astro-check';

const NOT_INSTALLED_SIGNATURES: ReadonlyArray<string> = [
  'could not determine executable to run',
  'Cannot find module',
  'npm ERR! 404',
  'command not found: astro',
  'npx canceled due to missing packages',
];

export interface RunAstroCheckOptions {
  readonly runner: ProcessRunner;
  readonly outputDir: string;
  readonly timeoutMs?: number;
}

export async function runAstroCheck(
  options: RunAstroCheckOptions,
): Promise<ReadonlyArray<Diagnostic>> {
  const result = await options.runner.run('npx', ['--yes', 'astro', 'check'], {
    cwd: options.outputDir,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  if (!result.ok) {
    return [
      {
        ruleId: 'astro-check-spawn-failed',
        severity: 'error',
        message: `astro check could not be spawned: ${result.error.message}`,
        source: SOURCE,
      },
    ];
  }

  const output = result.value;
  if (looksLikeNotInstalled(output.stdout, output.stderr)) {
    return [
      {
        ruleId: 'astro-check-not-installed',
        severity: 'error',
        message:
          'astro check could not run — astro is not installed in the output project. Run `npm install` in the output directory and re-invoke with `--check`, or drop `--check` to skip build validation.',
        source: SOURCE,
      },
    ];
  }

  return parseAstroCheckOutput(output);
}

function looksLikeNotInstalled(stdout: string, stderr: string): boolean {
  const haystack = `${stdout}\n${stderr}`;
  return NOT_INSTALLED_SIGNATURES.some((s) => haystack.includes(s));
}

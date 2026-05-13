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

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
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
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const result = await options.runner.run('npx', ['--yes', 'astro', 'check'], {
    cwd: options.outputDir,
    timeoutMs,
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
  if (output.timedOut) {
    return [
      {
        ruleId: 'astro-check-timeout',
        severity: 'error',
        message: buildTimeoutMessage({
          timeoutMs,
          outputDir: options.outputDir,
          silenceMs: output.silenceMs,
        }),
        source: SOURCE,
      },
    ];
  }

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

/**
 * Threshold past which stdout silence before kill is interpreted as "hung",
 * not "slow". 30s is conservative: astro check on a 2k-page site still emits
 * progress more often than that, so longer gaps signal a tight loop in the
 * language server rather than honest forward progress.
 */
const HANG_SILENCE_MS = 30_000;

interface TimeoutMessageInput {
  readonly timeoutMs: number;
  readonly outputDir: string;
  readonly silenceMs: number | undefined;
}

function buildTimeoutMessage(input: TimeoutMessageInput): string {
  const head = `\`astro check\` exceeded ${formatTimeout(input.timeoutMs)} and was killed`;
  const reproducer = `reproduce manually with \`cd ${input.outputDir} && npm install && npx astro check\``;
  const baseline = `The check is a one-shot type/validation pass and can be slow on large sites — it does not build or serve.`;
  if (input.silenceMs === undefined) {
    return `${head}; raise with \`--check-timeout ${input.timeoutMs * 2}\` or ${reproducer}. ${baseline}`;
  }
  if (input.silenceMs >= HANG_SILENCE_MS) {
    const silenceLabel = formatSilence(input.silenceMs);
    return `${head}; stdout was silent for ${silenceLabel} (${input.silenceMs}ms) before the kill. That gap usually means a hang in the language server rather than honest slow progress — though a single very slow file can also do it. Raising \`--check-timeout\` may just delay the same kill; ${reproducer} and watch whether output continues to flow before deciding. ${baseline}`;
  }
  const flowingLabel = formatSilence(input.silenceMs);
  return `${head}; the child was still producing output ${flowingLabel} (${input.silenceMs}ms) before the kill — the run was slow but progressing, so raising \`--check-timeout ${input.timeoutMs * 2}\` is the right next step, or ${reproducer}. ${baseline}`;
}

function formatSilence(ms: number): string {
  if (ms >= 60_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  const seconds = Math.round(ms / 1_000);
  return `${seconds}s`;
}

function formatTimeout(ms: number): string {
  if (ms % 60_000 === 0) {
    const minutes = ms / 60_000;
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  if (ms % 1_000 === 0) {
    const seconds = ms / 1_000;
    return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  }
  return `${ms}ms`;
}

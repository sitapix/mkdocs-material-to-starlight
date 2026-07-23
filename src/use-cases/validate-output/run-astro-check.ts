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
  // Deliberately NO `--yes`: when the output project has no node_modules,
  // npx would otherwise spend minutes silently downloading an UNPINNED
  // latest astro (version skew vs the project's pin) only to fail on the
  // missing @astrojs/starlight anyway. Without the flag, non-interactive
  // npx aborts immediately and the message routes to the existing
  // `astro-check-not-installed` diagnostic below.
  const result = await options.runner.run('npx', ['astro', 'check'], {
    cwd: options.outputDir,
    timeoutMs,
    // Telemetry consent banners would pollute the parsed output (and the
    // silence tracking) on first run.
    env: { ASTRO_TELEMETRY_DISABLED: '1' },
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
 * Threshold past which we call a silent gap a hang instead of slow progress.
 * 30s is conservative: astro check on a 2k-page site emits progress more
 * often than that. Longer gaps point at a tight loop in the language server.
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
  const baseline = `The check is a one-shot type/validation pass and can be slow on large sites. It does not build or serve.`;
  if (input.silenceMs === undefined) {
    return `${head}. Raise with \`--check-timeout ${input.timeoutMs * 2}\` or ${reproducer}. ${baseline}`;
  }
  if (input.silenceMs >= HANG_SILENCE_MS) {
    const silenceLabel = formatSilence(input.silenceMs);
    return `${head}. stdout was silent for ${silenceLabel} (${input.silenceMs}ms) before the kill. That gap usually points at a hang in the language server, though one very slow file can also cause it. Raising \`--check-timeout\` will likely hit the same kill; ${reproducer} and watch the output instead. ${baseline}`;
  }
  const flowingLabel = formatSilence(input.silenceMs);
  return `${head}. The child was still producing output ${flowingLabel} (${input.silenceMs}ms) before the kill, which means the run was slow but progressing. Raise \`--check-timeout ${input.timeoutMs * 2}\` or ${reproducer}. ${baseline}`;
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

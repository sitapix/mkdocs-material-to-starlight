/**
 * Wires the lazy clack adapter into the pure runWizard orchestrator and
 * translates the result into a ConvertCommand the existing convert path can
 * consume.
 *
 * The clack adapter is imported dynamically so users running with --yes or in
 * CI never load @clack/prompts or picocolors.
 */

import { resolveInteractivity } from '../../infrastructure/env/tty-detection.js';
import { deriveDefaults } from '../../use-cases/wizard/derive-defaults.js';
import { runWizard } from '../../use-cases/wizard/run-wizard.js';
import { answersToFlags } from '../../use-cases/wizard/answers-to-flags.js';
import { parseArgs, type Command } from './parse-args.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { parseMkdocsConfig } from '../../use-cases/config/parse-mkdocs.js';
import { explainConversion } from '../../use-cases/explain-conversion/explain.js';
import { extractSnippetBasePaths } from '../../use-cases/config/snippet-base-paths.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import type { CliIo } from './main.js';

export interface WizardRunResult {
  readonly kind: 'success';
  readonly command: Extract<Command, { kind: 'convert' }>;
  readonly equivalentFlags: ReadonlyArray<string>;
}
export interface WizardRunCancelled {
  readonly kind: 'cancelled';
}
export interface WizardRunNonInteractive {
  readonly kind: 'non-interactive';
}

/** Max attempts to re-prompt for a project dir before giving up. */
const PROJECT_DIR_MAX_ATTEMPTS = 3;

export async function runWizardFlow(
  projectDirHint: string,
  io: CliIo,
): Promise<WizardRunResult | WizardRunCancelled | WizardRunNonInteractive> {
  const env = process.env;
  const decision = resolveInteractivity({
    flags: {},
    env,
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    stdinIsTTY: Boolean(process.stdin.isTTY),
  });
  if (!decision.interactive) return { kind: 'non-interactive' };

  // Lazy-import clack here so the non-interactive path never pays for it.
  const { createClackPrompter } = await import(
    '../../infrastructure/prompts/clack-prompter.js'
  );
  const prompter = createClackPrompter();

  prompter.intro('mkdocs-material-to-starlight');
  prompter.log.info('Convert a MkDocs Material site to Astro Starlight.');

  // Step 1: project dir — re-prompt on missing/invalid mkdocs.yml so a typo
  // doesn't drop the user back to the shell.
  const loaded = await readProjectDirInteractively(prompter, projectDirHint);
  if (loaded === 'cancelled') {
    prompter.cancel('Cancelled. No files were written.');
    return { kind: 'cancelled' };
  }
  const { projectDir, configValue } = loaded;

  // Step 2: build the plan and defaults.
  const plan: ConversionPlan = {
    config: configValue,
    mappingRows: explainConversion(configValue),
    detectedExtraCss: [],
    detectedExtraJs: [],
    detectedLocales: [],
    snippetCandidateDirs: extractSnippetBasePaths(configValue),
  };
  const defaults = deriveDefaults(configValue, {
    userAgent: env.npm_config_user_agent,
    env,
  });

  // Surface what we detected before asking anything else, so users see why
  // the upcoming prompts exist. Levels use distinct shapes (◇/◆/▲), not just
  // color, so this remains legible without color or for color-blind readers.
  prompter.log.step(`Detected site: ${configValue.siteName}`);
  if (plan.mappingRows.length > 0) {
    prompter.log.step(
      `${String(plan.mappingRows.length)} feature mapping${plan.mappingRows.length === 1 ? '' : 's'} will fire (run with --explain to list them).`,
    );
  }

  // Step 3: run the rest of the wizard (outputDir, packageManager, Tier 1, Tier 2).
  const result = await runWizard({ projectDir, plan, defaults, prompter });
  if (!result.ok) {
    prompter.cancel('Cancelled. No files were written.');
    return { kind: 'cancelled' };
  }

  const flags = answersToFlags(result.value);
  const reparsed = parseArgs(flags);
  if (reparsed.kind !== 'convert') {
    io.stderr(`error: wizard produced an invalid command: ${JSON.stringify(reparsed)}`);
    prompter.cancel('Cancelled. No files were written.');
    return { kind: 'cancelled' };
  }
  return { kind: 'success', command: reparsed, equivalentFlags: flags };
}

interface LoadedConfig {
  readonly projectDir: string;
  readonly configValue: ReturnType<typeof parseMkdocsConfig> extends infer R
    ? R extends { ok: true; value: infer V }
      ? V
      : never
    : never;
}

/**
 * Prompt for the project dir, validate non-empty, then attempt to load
 * mkdocs.yml. If loading fails, surface the reason via `log.warn` and re-prompt
 * up to a small max so a typo is recoverable.
 *
 * The path picker (clack 1.3+) renders directory completion live, so users
 * can tab through their filesystem instead of typing the full path. While
 * the mkdocs.yml read+parse runs, a spinner shows progress so the prompt
 * doesn't appear to hang on slow disks or large config files.
 */
async function readProjectDirInteractively(
  prompter: Prompter,
  initialHint: string,
): Promise<LoadedConfig | 'cancelled'> {
  const yaml = createJsYamlDecoder();
  let hint = initialHint;
  for (let attempt = 0; attempt < PROJECT_DIR_MAX_ATTEMPTS; attempt++) {
    const projectDir = await prompter.path({
      message: 'Project directory (containing mkdocs.yml)',
      initialValue: hint,
      directory: true,
      validate: (value) => {
        if (value.trim().length === 0) return 'Path is required.';
        return undefined;
      },
    });
    if (projectDir === null) return 'cancelled';

    const configPath = join(projectDir, 'mkdocs.yml');
    const spin = prompter.spinner({
      initialMessage: `Reading ${configPath}`,
    });
    let configText: string;
    try {
      configText = await readFile(configPath, 'utf8');
    } catch {
      spin.error(`No mkdocs.yml at ${configPath}.`);
      hint = projectDir;
      continue;
    }
    spin.message('Parsing mkdocs.yml');
    const decoded = yaml.decode(configText);
    if (!decoded.ok) {
      spin.error(`mkdocs.yml is not valid YAML: ${decoded.error.message}`);
      hint = projectDir;
      continue;
    }
    const config = parseMkdocsConfig(decoded.value);
    if (!config.ok) {
      spin.error(`mkdocs.yml is missing required fields: ${config.error.message}`);
      hint = projectDir;
      continue;
    }
    spin.stop(`Loaded ${configPath}`);
    return { projectDir, configValue: config.value as LoadedConfig['configValue'] };
  }
  prompter.log.error(
    `Gave up after ${String(PROJECT_DIR_MAX_ATTEMPTS)} attempts. Run with --help to see CLI flags.`,
  );
  return 'cancelled';
}

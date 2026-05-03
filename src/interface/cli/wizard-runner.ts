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
import type { ConversionPlan } from '../../domain/wizard/plan.js';
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

  // Step 1: prompt for the project dir *before* loading mkdocs.yml. The
  // ConversionPlan depends on the chosen dir, so this prompt cannot live
  // inside runWizard (which takes the plan as input).
  prompter.intro('mkdocs-to-starlight');
  const projectDir = await prompter.text({
    message: 'Project directory (containing mkdocs.yml)',
    initialValue: projectDirHint,
  });
  if (projectDir === null) return { kind: 'cancelled' };

  // Step 2: load + parse mkdocs.yml from the chosen dir.
  const yaml = createJsYamlDecoder();
  const configPath = join(projectDir, 'mkdocs.yml');
  let configText: string;
  try {
    configText = await readFile(configPath, 'utf8');
  } catch {
    io.stderr(`error: could not read mkdocs.yml at ${configPath}`);
    return { kind: 'non-interactive' };
  }
  const decoded = yaml.decode(configText);
  if (!decoded.ok) {
    io.stderr(`error: yaml-decode-failed: ${decoded.error.message}`);
    return { kind: 'non-interactive' };
  }
  const config = parseMkdocsConfig(decoded.value);
  if (!config.ok) {
    io.stderr(`error: config-invalid: ${config.error.message}`);
    return { kind: 'non-interactive' };
  }

  // Step 3: build the plan and defaults.
  const plan: ConversionPlan = {
    config: config.value,
    mappingRows: explainConversion(config.value),
    detectedExtraCss: [],
    detectedExtraJs: [],
    detectedLocales: [],
    snippetCandidateDirs: [],
  };
  const defaults = deriveDefaults(config.value, {
    userAgent: env.npm_config_user_agent,
    env,
  });

  // Step 4: run the rest of the wizard (outputDir, packageManager, Tier 1, Tier 2).
  const result = await runWizard({ projectDir, plan, defaults, prompter });
  if (!result.ok) return { kind: 'cancelled' };

  const flags = answersToFlags(result.value);
  const reparsed = parseArgs(flags);
  if (reparsed.kind !== 'convert') {
    io.stderr(`error: wizard produced an invalid command: ${JSON.stringify(reparsed)}`);
    return { kind: 'cancelled' };
  }
  return { kind: 'success', command: reparsed, equivalentFlags: flags };
}

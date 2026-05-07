/**
 * Wires the lazy clack adapter into the pure runWizard orchestrator and
 * translates the result into a ConvertCommand the existing convert path can
 * consume.
 *
 * The clack adapter is imported dynamically so users running with --yes or in
 * CI never load @clack/prompts or picocolors.
 */

import { getTranslationDepth } from '../../domain/conversion-mapping/table.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import { resolveInteractivity } from '../../infrastructure/env/tty-detection.js';
import { createNodeDirInspector } from '../../infrastructure/fs/dir-inspector.js';
import { extractSnippetBasePaths } from '../../use-cases/config/snippet-base-paths.js';
import { explainConversion } from '../../use-cases/explain-conversion/explain.js';
import { answersToFlags } from '../../use-cases/wizard/answers-to-flags.js';
import { confirmOverwriteIfNeeded } from '../../use-cases/wizard/confirm-overwrite.js';
import { deriveDefaults } from '../../use-cases/wizard/derive-defaults.js';
import { formatEquivalentCommand } from '../../use-cases/wizard/format-equivalent-command.js';
import { needsAttentionPreview } from '../../use-cases/wizard/needs-attention-preview.js';
import { runWizard } from '../../use-cases/wizard/run-wizard.js';
import type { CliIo } from './main.js';
import { type Command, parseArgs } from './parse-args.js';
import { readProjectDirInteractively } from './wizard-project-dir.js';

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
  const { createClackPrompter } = await import('../../infrastructure/prompts/clack-prompter.js');
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

  // Pre-conversion warnings: surface every mapping row whose translation is
  // lossy or manual BEFORE the conversion runs, so the user knows what
  // post-conversion work to expect. Full / passthrough / recommend-dep rows
  // are silent — those are the happy-path translations.
  const lossyRows = plan.mappingRows.filter((row) => getTranslationDepth(row) === 'lossy-named');
  const manualRows = plan.mappingRows.filter((row) => getTranslationDepth(row) === 'manual');
  if (lossyRows.length > 0) {
    prompter.note(
      lossyRows.map((r) => `• ${r.featureId} — ${r.starlightOutput}`).join('\n'),
      `${String(lossyRows.length)} lossy translation${lossyRows.length === 1 ? '' : 's'} (named loss; diagnostic surfaces it)`,
    );
  }
  if (manualRows.length > 0) {
    prompter.note(
      manualRows.map((r) => `• ${r.featureId} — ${r.starlightOutput}`).join('\n'),
      `${String(manualRows.length)} manual remediation${manualRows.length === 1 ? '' : 's'} required (no automatic translation)`,
    );
  }

  // Heads-up: any plugin/extension that won't auto-convert is surfaced as a
  // single bulleted note before any prompt fires, with a learn-more URL per
  // item. Same data that lands in MIGRATION_NOTES.md after conversion — we
  // just show it earlier so the user can decide whether to proceed.
  const attention = needsAttentionPreview(configValue);
  if (attention.length > 0) {
    const lines = attention.map((a) => `• ${a.name} — ${a.docsUrl}`);
    prompter.note(
      lines.join('\n'),
      `${String(attention.length)} item${attention.length === 1 ? '' : 's'} will need manual attention`,
    );
  }

  // Step 3: run the rest of the wizard (outputDir, packageManager, Tier 1, Tier 2).
  const result = await runWizard({ projectDir, plan, defaults, prompter });
  if (!result.ok) {
    prompter.cancel('Cancelled. No files were written.');
    return { kind: 'cancelled' };
  }

  // Safety net: outputDir is a destructive write target. If it already exists
  // and is non-empty, surface the warning and ask once — defaulting to "no" so
  // an inattentive Enter can't trample an unrelated project. On confirm we
  // append --force so the convert path proceeds; on decline we exit cleanly.
  const overwrite = await confirmOverwriteIfNeeded(
    prompter,
    createNodeDirInspector(),
    result.value.outputDir,
  );
  if (overwrite === 'cancelled') {
    prompter.cancel('Cancelled. No files were written.');
    return { kind: 'cancelled' };
  }

  const baseFlags = answersToFlags(result.value);
  const flags = overwrite === 'confirmed' ? [...baseFlags, '--force'] : baseFlags;
  const reparsed = parseArgs(flags);
  if (reparsed.kind !== 'convert') {
    io.stderr(`error: wizard produced an invalid command: ${JSON.stringify(reparsed)}`);
    prompter.cancel('Cancelled. No files were written.');
    return { kind: 'cancelled' };
  }
  // Show the equivalent CLI invocation as a framed note so the user can save
  // it for unattended re-runs. Rendered while the prompter session is still
  // active — once we return, the shell prints the diagnostic report unframed.
  prompter.note(formatEquivalentCommand(flags), 'Equivalent command (save to re-run unattended)');
  return { kind: 'success', command: reparsed, equivalentFlags: flags };
}

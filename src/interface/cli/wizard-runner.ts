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
import { createNodeDirectoryReader } from '../../infrastructure/fs/node-directory-reader.js';
import { createNodeWizardPrefsStore } from '../../infrastructure/fs/wizard-prefs-store.js';
import { extractSnippetBasePaths } from '../../use-cases/config/snippet-base-paths.js';
import { explainConversion } from '../../use-cases/explain-conversion/explain.js';
import { answersToFlags } from '../../use-cases/wizard/answers-to-flags.js';
import { confirmOverwriteIfNeeded } from '../../use-cases/wizard/confirm-overwrite.js';
import { deriveDefaults } from '../../use-cases/wizard/derive-defaults.js';
import { formatAttentionLines } from '../../use-cases/wizard/format-attention-lines.js';
import { formatEquivalentCommand } from '../../use-cases/wizard/format-equivalent-command.js';
import { needsAttentionPreview } from '../../use-cases/wizard/needs-attention-preview.js';
import { restorePrefs } from '../../use-cases/wizard/restore-prefs.js';
import { runWizard } from '../../use-cases/wizard/run-wizard.js';
import { validateProjectPreflight } from '../../use-cases/wizard/validate-project-preflight.js';
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
  prompter.log.info('Convert your MkDocs Material site to Astro Starlight.');

  // Step 1: project dir — re-prompt on missing/invalid mkdocs.yml so a typo
  // doesn't drop the user back to the shell.
  const loaded = await readProjectDirInteractively(prompter, projectDirHint);
  if (loaded === 'cancelled') {
    prompter.cancel('Cancelled. Nothing changed.');
    return { kind: 'cancelled' };
  }
  const { projectDir, configValue } = loaded;

  // Re-run memory: if the user converted this project before, offer to skip
  // the wizard and run with their saved flags. Best-effort — any read error
  // collapses to "no prefs" so a corrupt file never blocks the wizard.
  const prefsStore = createNodeWizardPrefsStore();
  const restored = await restorePrefs(prompter, prefsStore, projectDir);
  if (restored !== null) {
    const reparsedRestored = parseArgs(restored);
    if (reparsedRestored.kind === 'convert') {
      prompter.note(
        formatEquivalentCommand(restored, undefined, { binary: prompter.highlight.name }),
        'Re-running with your saved answers',
      );
      prompter.outro('Converting…');
      return { kind: 'success', command: reparsedRestored, equivalentFlags: restored };
    }
    // Saved flags failed to re-parse (CLI surface drift since they were
    // written). Fall through to the normal wizard rather than blocking.
    prompter.log.warn("Saved answers don't match the current CLI. Starting fresh.");
  }

  // Preflight: validate `docs_dir` resolves before asking any prompt. Mirrors
  // the convert-time check in `prepareConvertContext` but runs in
  // milliseconds — fails fast on a misconfigured `docs_dir:` so the user
  // doesn't answer a dozen prompts only to hit a "no markdown found" error
  // afterwards. Cancellation here keeps the framed UX (no raw stderr dump).
  const preflight = await validateProjectPreflight(
    projectDir,
    configValue,
    createNodeDirectoryReader(),
  );
  if (!preflight.ok) {
    prompter.note(preflight.error.message, 'Found a problem with your project');
    prompter.cancel('Fix the issue above and try again.');
    return { kind: 'cancelled' };
  }

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
  // Decoration goes through prompter.highlight (defined on the port) so the
  // ANSI vocabulary lives next to the adapter and tests stay plain-text.
  const { name: hlName, url: hlUrl, count: hlCount } = prompter.highlight;
  prompter.log.step(`Found your site: ${hlName(configValue.siteName)}`);
  if (plan.mappingRows.length > 0) {
    prompter.log.step(
      `${hlCount(String(plan.mappingRows.length))} feature mapping${plan.mappingRows.length === 1 ? '' : 's'} will fire (run with ${hlUrl('--explain')} to list them).`,
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
      formatAttentionLines(
        lossyRows.map((r) => ({ name: r.featureId, description: r.starlightOutput })),
        { name: hlName },
      ),
      `${hlCount(String(lossyRows.length))} lossy translation${lossyRows.length === 1 ? '' : 's'}`,
    );
  }
  if (manualRows.length > 0) {
    prompter.note(
      formatAttentionLines(
        manualRows.map((r) => ({ name: r.featureId, description: r.starlightOutput })),
        { name: hlName },
      ),
      `${hlCount(String(manualRows.length))} manual remediation${manualRows.length === 1 ? '' : 's'}`,
    );
  }

  // Heads-up: any plugin/extension that won't auto-convert is surfaced as a
  // single bulleted note before any prompt fires, with a learn-more URL per
  // item. Same data that lands in MIGRATION_NOTES.md after conversion — we
  // just show it earlier so the user can decide whether to proceed.
  const attention = needsAttentionPreview(configValue);
  if (attention.length > 0) {
    prompter.note(
      formatAttentionLines(
        attention.map((a) => ({ name: a.name, description: a.docsUrl })),
        { name: hlName, description: hlUrl },
      ),
      `${hlCount(String(attention.length))} item${attention.length === 1 ? '' : 's'} will need manual attention`,
    );
  }

  // Step 3: run the rest of the wizard (outputDir, packageManager, Tier 1, Tier 2).
  // cwd is read here (impure shell) and threaded into the pure wizard so the
  // default output dir is `${cwd}/starlight` — the most discoverable answer
  // for "where will this land?"
  const result = await runWizard({ projectDir, cwd: process.cwd(), plan, defaults, prompter });
  if (!result.ok) {
    prompter.cancel('Cancelled. Nothing changed.');
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
    prompter.cancel('Cancelled. Nothing changed.');
    return { kind: 'cancelled' };
  }

  const baseFlags = answersToFlags(result.value);
  const flags = overwrite === 'confirmed' ? [...baseFlags, '--force'] : baseFlags;
  const reparsed = parseArgs(flags);
  if (reparsed.kind !== 'convert') {
    io.stderr(`error: wizard produced an invalid command: ${JSON.stringify(reparsed)}`);
    prompter.cancel('Cancelled. Nothing changed.');
    return { kind: 'cancelled' };
  }
  // Show the equivalent CLI invocation as a framed note so the user can save
  // it for unattended re-runs. Rendered while the prompter session is still
  // active — once we return, the shell prints the diagnostic report unframed.
  prompter.note(
    formatEquivalentCommand(flags, undefined, { binary: prompter.highlight.name }),
    'Save this command to skip the wizard next time',
  );
  // Persist the answer set so the next run can offer to skip the wizard.
  // Best-effort: a write failure is logged inline but never aborts a
  // successful wizard run — the equivalent-command note above is the
  // user's primary handoff, the prefs file is a convenience.
  const written = await prefsStore.write(projectDir, { version: 1, flags });
  if (!written.ok) {
    prompter.log.warn(`Could not save answers for next run: ${written.error.message}`);
  }
  // Set expectations before the frame closes: when astro check was opted into,
  // the user is about to wait 30-60s for conversion + check to finish, and the
  // results appear OUTSIDE the rail (formatReport prints to plain stdout). A
  // one-line heads-up beats a silent pause.
  if (reparsed.check) {
    prompter.log.info(
      `${prompter.highlight.value('astro check')} runs after conversion. Results appear below.`,
    );
  }
  // Close the frame with a proper outro so the rail visually terminates before
  // the diagnostic report dumps to stdout. Without this, the rail's vertical
  // bar trails into ungated text and the visual handoff is messy.
  prompter.outro('Converting…');
  return { kind: 'success', command: reparsed, equivalentFlags: flags };
}

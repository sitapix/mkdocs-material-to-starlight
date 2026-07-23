/**
 * Wires the lazy clack adapter into the pure runWizard orchestrator and
 * translates the result into a ConvertCommand the existing convert path can
 * consume.
 *
 * The clack adapter is imported dynamically so users running with --yes or in
 * CI never load @clack/prompts or picocolors.
 */

import { attentionSummary } from '../../domain/conversion-mapping/attention-summary.js';
import { getTranslationDepth } from '../../domain/conversion-mapping/table.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import type { Prompter, SpinnerHandle } from '../../domain/wizard/ports/prompter.js';
import { resolveInteractivity } from '../../infrastructure/env/tty-detection.js';
import { createNodeDirInspector } from '../../infrastructure/fs/dir-inspector.js';
import { createNodeDirectoryReader } from '../../infrastructure/fs/node-directory-reader.js';
import { createNodeWizardPrefsStore } from '../../infrastructure/fs/wizard-prefs-store.js';
import { extractSnippetBasePaths } from '../../use-cases/config/snippet-base-paths.js';
import { explainConversion } from '../../use-cases/explain-conversion/explain.js';
import { answersToFlags } from '../../use-cases/wizard/answers-to-flags.js';
import { confirmOverwriteIfNeeded } from '../../use-cases/wizard/confirm-overwrite.js';
import { convertPhaseMessage } from '../../use-cases/wizard/convert-phase-message.js';
import { deriveDefaults } from '../../use-cases/wizard/derive-defaults.js';
import { formatAttentionLines } from '../../use-cases/wizard/format-attention-lines.js';
import { formatEquivalentCommand } from '../../use-cases/wizard/format-equivalent-command.js';
import { needsAttentionPreview } from '../../use-cases/wizard/needs-attention-preview.js';
import { restorePrefs } from '../../use-cases/wizard/restore-prefs.js';
import { runWizard } from '../../use-cases/wizard/run-wizard.js';
import { validateProjectPreflight } from '../../use-cases/wizard/validate-project-preflight.js';
import { welcomeBanner } from '../../use-cases/wizard/welcome-banner.js';
import { withForceFlag } from '../../use-cases/wizard/with-force-flag.js';
import type { CliIo } from './main.js';
import { type Command, parseArgs } from './parse-args.js';
import { readProjectDirInteractively } from './wizard-project-dir.js';

export interface WizardRunResult {
  /**
   * The wizard finished and the converter ran. `exitCode` carries whether the
   * convert itself was clean (0) or had error-severity diagnostics (1) — the
   * discriminator is intentionally NOT named `'success'` because a `kind`
   * matching `'success'` while `exitCode === 1` is misleading at the call
   * site.
   */
  readonly kind: 'completed';
  readonly command: Extract<Command, { kind: 'convert' }>;
  readonly equivalentFlags: ReadonlyArray<string>;
  /** Process exit code from the conversion the wizard ran inline. */
  readonly exitCode: number;
}
export interface WizardRunCancelled {
  readonly kind: 'cancelled';
}
export interface WizardRunNonInteractive {
  readonly kind: 'non-interactive';
}

/**
 * Single source of truth for the goodbye banner shown when the user cancels
 * (Ctrl+C, Esc, or a "no" at a destructive-action gate). Kept as a constant so
 * tone stays uniform across every cancellation path.
 */
const WIZARD_CANCEL_MESSAGE = 'Cancelled. Nothing changed.';

function cancelAndReturn(prompter: Prompter): WizardRunCancelled {
  prompter.cancel(WIZARD_CANCEL_MESSAGE);
  return { kind: 'cancelled' };
}

/**
 * Conversion callback the wizard runs inside a clack spinner. Returns the
 * rendered diagnostic report (instead of writing it directly) so the wizard
 * can stop the spinner and outro the rail before stdout takes over —
 * otherwise the spinner animation fights with the report's stdout writes.
 */
export type WizardConverter = (
  command: Extract<Command, { kind: 'convert' }>,
) => Promise<
  | { readonly kind: 'ok'; readonly exitCode: number; readonly report: string }
  | { readonly kind: 'fatal'; readonly message: string }
>;

export async function runWizardFlow(
  projectDirHint: string,
  io: CliIo,
  converter: WizardConverter,
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

  // Banner sits ABOVE clack's intro rail, written via io.stdout (the same
  // channel used for the diagnostic report). Once `prompter.intro(...)` runs,
  // the rail starts and subsequent stdout writes would collide with it.
  io.stdout(welcomeBanner(prompter.highlight));
  prompter.intro('Setup');

  // Step 1: project dir — re-prompt on missing/invalid mkdocs.yml so a typo
  // doesn't drop the user back to the shell.
  const loaded = await readProjectDirInteractively(prompter, projectDirHint);
  if (loaded === 'cancelled') {
    return cancelAndReturn(prompter);
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
      // Saved-prefs path bypasses the full wizard, so it has to run the same
      // overwrite guard the wizard normally fires before convert. Without
      // this, a re-run against an existing non-empty output dir errors out
      // with "output-not-empty" *after* the spinner starts, with no way to
      // recover from inside the wizard.
      const overwrite = await confirmOverwriteIfNeeded(
        prompter,
        createNodeDirInspector(),
        reparsedRestored.outputDir,
      );
      if (overwrite === 'cancelled') {
        return cancelAndReturn(prompter);
      }
      const finalFlags = overwrite === 'confirmed' ? withForceFlag(restored) : restored;
      const finalCommand = overwrite === 'confirmed' ? parseArgs(finalFlags) : reparsedRestored;
      if (finalCommand.kind !== 'convert') {
        // Defensive: withForceFlag only appends --force, which is a known
        // valid flag. If parseArgs disagrees, fall through to the full wizard
        // instead of crashing.
        prompter.log.warn("Saved answers don't match the current CLI. Starting fresh.");
      } else {
        prompter.note(
          formatEquivalentCommand(finalFlags, undefined, { binary: prompter.highlight.name }),
          'Re-running with your saved answers',
        );
        renderConvertAnnouncement(prompter, finalCommand.check);
        // Same spinner-then-print pattern as the full wizard path below.
        const spin = prompter.spinner({
          initialMessage: 'Walking files…',
          indicator: 'timer',
        });
        const phaseTimer = startPhaseRotation(spin, finalCommand.check);
        // try/finally guarantees the phase-rotation interval is cleared even
        // if the converter throws (defense in depth — converter follows the
        // diagnostics-over-throws contract today, but a future bug shouldn't
        // leak a setInterval onto the event loop).
        let converted: Awaited<ReturnType<typeof converter>>;
        try {
          converted = await converter(finalCommand);
        } finally {
          clearInterval(phaseTimer);
        }
        if (converted.kind === 'fatal') {
          spin.error(converted.message);
          prompter.cancel('Conversion failed.');
          return {
            kind: 'completed',
            command: finalCommand,
            equivalentFlags: finalFlags,
            exitCode: 1,
          };
        }
        spin.stop(converted.exitCode === 0 ? 'Converted' : 'Converted with errors');
        prompter.outro(converted.exitCode === 0 ? 'All done.' : 'Done with diagnostics.');
        io.stdout(converted.report);
        return {
          kind: 'completed',
          command: finalCommand,
          equivalentFlags: finalFlags,
          exitCode: converted.exitCode,
        };
      }
    } else {
      // Saved flags failed to re-parse (CLI surface drift since they were
      // written). Fall through to the normal wizard rather than blocking.
      prompter.log.warn("Saved answers don't match the current CLI. Starting fresh.");
    }
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
        lossyRows.map((r) => ({ name: r.featureId, description: attentionSummary(r) })),
        { name: hlName },
      ),
      `${hlCount(String(lossyRows.length))} lossy translation${lossyRows.length === 1 ? '' : 's'}`,
    );
  }
  if (manualRows.length > 0) {
    prompter.note(
      formatAttentionLines(
        manualRows.map((r) => ({ name: r.featureId, description: attentionSummary(r) })),
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
    return cancelAndReturn(prompter);
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
    return cancelAndReturn(prompter);
  }

  const baseFlags = answersToFlags(result.value);
  const flags = overwrite === 'confirmed' ? [...baseFlags, '--force'] : baseFlags;
  const reparsed = parseArgs(flags);
  if (reparsed.kind !== 'convert') {
    io.stderr(`error: wizard produced an invalid command: ${JSON.stringify(reparsed)}`);
    return cancelAndReturn(prompter);
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
  // Run conversion inside a spinner so the user has live feedback during the
  // long compute step (mkdocs.yml parse → file walk → AST passes → write).
  // The converter callback returns the report as a string instead of writing
  // it directly: we stop the spinner FIRST (so the rail terminates cleanly),
  // outro, THEN print the report — that way stdout text never collides with
  // the spinner's single-line animation.
  renderConvertAnnouncement(prompter, reparsed.check);
  const spin = prompter.spinner({
    initialMessage: 'Walking files…',
    indicator: 'timer',
  });
  const phaseTimer = startPhaseRotation(spin, reparsed.check);
  // try/finally guarantees the phase-rotation interval is cleared even if the
  // converter throws — see the note on the saved-prefs path above.
  let converted: Awaited<ReturnType<typeof converter>>;
  try {
    converted = await converter(reparsed);
  } finally {
    clearInterval(phaseTimer);
  }
  if (converted.kind === 'fatal') {
    spin.error(converted.message);
    prompter.cancel('Conversion failed.');
    return { kind: 'completed', command: reparsed, equivalentFlags: flags, exitCode: 1 };
  }
  const verb = converted.exitCode === 0 ? 'Converted' : 'Converted with errors';
  spin.stop(verb);
  if (reparsed.check) {
    prompter.log.info(`${prompter.highlight.value('astro check')} ran. Results appear below.`);
  }
  prompter.outro(
    converted.exitCode === 0 ? 'All done.' : 'Done with diagnostics — see report below.',
  );
  io.stdout(converted.report);
  return {
    kind: 'completed',
    command: reparsed,
    equivalentFlags: flags,
    exitCode: converted.exitCode,
  };
}

/**
 * Render a multi-line note immediately above the convert spinner. The spinner
 * itself is a single tiny glyph; without something prominent above it, a
 * multi-minute `--check` run reads as "did the wizard hang?". The note
 * explains the phases and honest worst-case duration, so the spinner below
 * serves only as a "still alive" pulse.
 *
 * Why the duration looks high for `--check`: conversion itself is fast
 * (often under a second). `astro check` adds seconds-to-a-couple-minutes
 * depending on site size — and requires `npm install` to have run in the
 * output directory first (without it, the check fails fast with an
 * actionable diagnostic rather than running).
 */
function renderConvertAnnouncement(prompter: Prompter, withAstroCheck: boolean): void {
  if (withAstroCheck) {
    prompter.note(
      [
        '`--check` runs `astro check`: typically seconds, up to a couple of minutes on large sites.',
        'It needs dependencies installed — if `npm install` has not run in the output directory,',
        'the check reports that immediately instead of running.',
        '',
        'Phases: walk files → transform AST → write output → astro check',
      ].join('\n'),
      'Converting your site',
    );
    return;
  }
  prompter.note(
    [
      'Typical run: a few seconds, even on thousand-page sites.',
      'Phases: walk files → transform AST → write output',
    ].join('\n'),
    'Converting your site',
  );
}

/**
 * Rotate the spinner's status message through phase guesses on a 2s cadence
 * so the line advances visibly during a long convert. The phase boundaries
 * are time-based approximations because the converter doesn't emit phase
 * events — accurate enough to keep the user oriented; not load-bearing for
 * correctness. Caller is responsible for `clearInterval` in every exit path.
 */
function startPhaseRotation(spin: SpinnerHandle, withAstroCheck: boolean): NodeJS.Timeout {
  const startedAt = Date.now();
  return setInterval(() => {
    spin.message(convertPhaseMessage(Date.now() - startedAt, { withAstroCheck }));
  }, 2_000);
}

/**
 * The wizard orchestrator. Pure: takes a Prompter port and a ConversionPlan,
 * returns a Result wrapping WizardAnswers or WIZARD_CANCELLED.
 *
 * Tiers are split into separate modules (`run-tier0.ts`, `run-tier1.ts`,
 * `run-tier2.ts`) to keep each function under the size cap.
 *
 * `projectDir` is an INPUT, not a prompt — the interface layer
 * (`wizard-runner.ts`) already resolved and validated it via
 * `readProjectDirInteractively` before building the `ConversionPlan`. By the
 * time we get here, the dir is known-good (mkdocs.yml parsed) and the user
 * has confirmed any monorepo redirect. Re-prompting would either duplicate
 * validation or risk reverting a confirmed redirect.
 *
 * UX note: the "advanced options?" gate is asked exactly once, after Tier 1.
 * If the user picks "Show advanced options" we run Tier 2 and then convert
 * directly — we don't re-ask "Convert now?", because by then opting in to
 * Tier 2 already was an opt-in to converting once finished. Cancellation is
 * always available via Ctrl+C or Esc, which clack maps to a null answer.
 */

import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import {
  type DefaultAnswers,
  type WizardAnswers,
  type WizardCancelled,
  WIZARD_CANCELLED,
} from '../../domain/wizard/answers.js';
import { type Result, err, ok } from '../../domain/result.js';
import { runTier0 } from './run-tier0.js';
import { runTier1 } from './run-tier1.js';
import { runTier2 } from './run-tier2.js';
import { formatRecap } from './format-recap.js';

export interface RunWizardInput {
  readonly projectDir: string;
  readonly plan: ConversionPlan;
  readonly defaults: DefaultAnswers;
  readonly prompter: Prompter;
}

export async function runWizard(
  input: RunWizardInput,
): Promise<Result<WizardAnswers, WizardCancelled>> {
  const { projectDir, plan, defaults, prompter } = input;

  const tier0 = await runTier0(prompter, plan, defaults);
  if (!tier0.ok) return tier0;

  const tier1 = await runTier1(prompter, plan, defaults);
  if (!tier1.ok) return tier1;

  // Recap: standard CLI-init pattern. Show the user exactly what they're
  // about to commit to before the destructive write happens. Lines are
  // emitted only for decisions the user actually answered, so the recap
  // reflects what was asked rather than dumping the full answer set.
  prompter.note(
    formatRecap({ projectDir, tier0: tier0.value, tier1: tier1.value }),
    'About to convert — review your choices',
  );

  // Single gate: convert with current answers, or open advanced options.
  // Cancel is always Ctrl+C / Esc — we don't surface it as a third option to
  // keep the menu binary and the "happy path" obvious.
  //
  // selectKey lets the user hit `c` or `a` without pressing Enter — one
  // keystroke for the most common decision point in the whole flow.
  const next = await prompter.selectKey<'c' | 'a'>({
    message: 'Convert now, or review advanced options first?',
    options: [
      { value: 'c', label: 'Convert now (press c)' },
      { value: 'a', label: 'Review advanced options first (press a)' },
    ],
    initialValue: 'c',
  });
  if (next === null) return err(WIZARD_CANCELLED);

  let tier2: Partial<WizardAnswers> = {};
  if (next === 'a') {
    const t2 = await runTier2(prompter, defaults);
    if (!t2.ok) return t2;
    tier2 = t2.value;
  }

  // Layered merge: defaults provide the baseline for every field, then each
  // tier's answers override only the fields it actually collected (the tier
  // accumulators are Partial<WizardAnswers>, so untouched fields aren't
  // spread). Adding a new wizard field means only updating the type and the
  // tier that asks — no per-field plumbing here.
  const answers: WizardAnswers = {
    ...defaults,
    projectDir,
    ...tier0.value,
    ...tier1.value,
    ...tier2,
  };
  return ok(answers);
}

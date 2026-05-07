/**
 * Wizard entry-point helper: try to load saved per-project prefs and ask
 * the user whether to re-use them. Returns the flags array on accept, or
 * `null` for "proceed with normal defaults" (no prefs, declined, cancelled,
 * or read failed).
 *
 * Pure orchestration: I/O happens via the WizardPrefsStore port, the
 * decision via the Prompter port. Tests inject fakes for both.
 *
 * Failure policy: read errors silently degrade to "no prefs." A broken or
 * unreadable prefs file is never a wizard-blocking condition — the user
 * can always answer the prompts fresh.
 */

import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import type { WizardPrefsStore } from '../../domain/wizard/ports/wizard-prefs-store.js';

export async function restorePrefs(
  prompter: Prompter,
  store: WizardPrefsStore,
  projectDir: string,
): Promise<ReadonlyArray<string> | null> {
  const read = await store.read(projectDir);
  if (!read.ok) return null;
  const prefs = read.value;
  if (prefs === null) return null;

  const accept = await prompter.confirm({
    message: 'Re-use saved answers from your previous run?',
    initialValue: true,
    active: 'Yes (skip prompts you already answered)',
    inactive: 'No (start fresh)',
  });
  if (accept !== true) return null;
  return prefs.flags;
}

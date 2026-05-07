import { err, ok, type Result } from '../../domain/result.js';
import {
  type DefaultAnswers,
  type PackageManager,
  WIZARD_CANCELLED,
  type WizardCancelled,
} from '../../domain/wizard/answers.js';
import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import { deriveOutputDirName } from './derive-defaults.js';

export interface Tier0Answers {
  readonly outputDir: string;
  readonly packageManager: PackageManager;
  readonly check: boolean;
}

/**
 * Tier 0: the unconditional questions. Output directory uses a plain `text`
 * prompt — not clack's `path` (directory picker) — because the picker forces
 * selecting an *existing* directory, which is the wrong shape for "create a
 * new Starlight site." With `text`, the user can accept the suggested default
 * (a fresh `starlight/` next to their cwd), edit it inline, or type any path;
 * the conversion pipeline mkdir-recursives the destination on first write.
 */
export async function runTier0(
  prompter: Prompter,
  cwd: string,
  defaults: DefaultAnswers,
): Promise<Result<Tier0Answers, WizardCancelled>> {
  const suggested = deriveOutputDirName(cwd);
  const outputDir = await prompter.text({
    message: 'Output directory',
    // Idiomatic clack: empty input field with the suggestion shown as a
    // dimmed placeholder, and `defaultValue` returned when the user submits
    // a bare Enter. Matches create-astro / create-svelte UX so users don't
    // have to backspace through a pre-filled value to type their own.
    placeholder: suggested,
    defaultValue: suggested,
    validate: (value) => {
      if (value.trim().length === 0) return 'Please enter a path.';
      return undefined;
    },
  });
  if (outputDir === null) return err(WIZARD_CANCELLED);

  const packageManager = await prompter.select<PackageManager>({
    message: 'Package manager',
    options: [
      { value: 'npm', label: 'npm' },
      { value: 'pnpm', label: 'pnpm' },
      { value: 'yarn', label: 'yarn' },
      { value: 'bun', label: 'bun' },
    ],
    initialValue: defaults.packageManager,
  });
  if (packageManager === null) return err(WIZARD_CANCELLED);

  const check = await prompter.confirm({
    message: 'Run astro check after conversion?',
    initialValue: defaults.check,
    active: 'Yes (slower, catches schema errors)',
    inactive: 'No (faster)',
  });
  if (check === null) return err(WIZARD_CANCELLED);

  return ok({ outputDir, packageManager, check });
}

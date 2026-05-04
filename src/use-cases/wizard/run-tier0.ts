import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import {
  type DefaultAnswers,
  type PackageManager,
  type WizardCancelled,
  WIZARD_CANCELLED,
} from '../../domain/wizard/answers.js';
import { type Result, err, ok } from '../../domain/result.js';
import { deriveOutputDirName } from './derive-defaults.js';

export interface Tier0Answers {
  readonly outputDir: string;
  readonly packageManager: PackageManager;
  readonly check: boolean;
}

/**
 * Tier 0: the unconditional questions. Output directory uses the `path`
 * prompt (clack 1.3+) so the user gets directory completion and live
 * validation as they type.
 */
export async function runTier0(
  prompter: Prompter,
  plan: ConversionPlan,
  defaults: DefaultAnswers,
): Promise<Result<Tier0Answers, WizardCancelled>> {
  const outputDir = await prompter.path({
    message: 'Output directory',
    initialValue: deriveOutputDirName(plan.config.siteName),
    directory: true,
    validate: (value) => {
      if (value.trim().length === 0) return 'Path is required.';
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

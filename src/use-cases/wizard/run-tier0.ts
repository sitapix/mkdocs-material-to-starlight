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

export async function runTier0(
  prompter: Prompter,
  plan: ConversionPlan,
  defaults: DefaultAnswers,
): Promise<Result<Tier0Answers, WizardCancelled>> {
  const outputDir = await prompter.text({
    message: 'Output directory',
    initialValue: deriveOutputDirName(plan.config.siteName),
  });
  if (outputDir === null) return err(WIZARD_CANCELLED);

  const packageManager = await prompter.select<PackageManager>({
    message: 'Package manager (used in the final "next steps" hint)',
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
    message: 'Run `astro check` against the converted site?',
    initialValue: defaults.check,
  });
  if (check === null) return err(WIZARD_CANCELLED);

  return ok({ outputDir, packageManager, check });
}

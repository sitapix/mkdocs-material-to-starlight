import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import {
  type DefaultAnswers,
  type WizardAnswers,
  type WizardCancelled,
  WIZARD_CANCELLED,
} from '../../domain/wizard/answers.js';
import { type Result, err, ok } from '../../domain/result.js';

export async function runTier2(
  prompter: Prompter,
  defaults: DefaultAnswers,
): Promise<Result<Partial<WizardAnswers>, WizardCancelled>> {
  const linksValidator = await prompter.confirm({
    message: 'Run `starlight-links-validator` on every build? (slow on first run)',
    initialValue: defaults.linksValidator,
  });
  if (linksValidator === null) return err(WIZARD_CANCELLED);

  const cards = await prompter.select<'mdx' | 'html' | 'skip'>({
    message: 'Card / grid output',
    options: [
      { value: 'html', label: 'HTML + shipped CSS shim (default)' },
      { value: 'mdx', label: 'Starlight <Card> / <CardGrid> MDX' },
      { value: 'skip', label: 'Skip — no cards, no shim' },
    ],
    initialValue: defaults.cards,
  });
  if (cards === null) return err(WIZARD_CANCELLED);

  const mdxMode = await prompter.select<'auto' | 'always' | 'never'>({
    message: '.mdx promotion strategy',
    options: [
      { value: 'auto', label: 'Auto — promote when JSX/imports detected (default)' },
      { value: 'always', label: 'Always — every page becomes .mdx' },
      { value: 'never', label: 'Never — keep .md (may break embedded JSX)' },
    ],
    initialValue: defaults.mdxMode,
  });
  if (mdxMode === null) return err(WIZARD_CANCELLED);

  const configFormat = await prompter.select<'mjs' | 'ts'>({
    message: 'Astro config format',
    options: [
      { value: 'mjs', label: 'astro.config.mjs (default)' },
      { value: 'ts', label: 'astro.config.ts (typed)' },
    ],
    initialValue: defaults.configFormat,
  });
  if (configFormat === null) return err(WIZARD_CANCELLED);

  return ok({ linksValidator, cards, mdxMode, configFormat });
}

import { err, ok, type Result } from '../../domain/result.js';
import {
  type DefaultAnswers,
  WIZARD_CANCELLED,
  type WizardAnswers,
  type WizardCancelled,
} from '../../domain/wizard/answers.js';
import type { Prompter } from '../../domain/wizard/ports/prompter.js';

/**
 * Tier 2: advanced settings the wizard exposes interactively. The remainder
 * of the converter's surface is reachable via CLI flags (see `--help`); we
 * tell the user that once, in one line, instead of dumping a wall of flags.
 *
 * Each prompt pre-selects the safe default and labels recommendations via
 * the `hint` field so the option labels stay short.
 */
export async function runTier2(
  prompter: Prompter,
  defaults: DefaultAnswers,
): Promise<Result<Partial<WizardAnswers>, WizardCancelled>> {
  prompter.log.info(
    'Advanced options below. Anything not asked here is reachable via CLI flags — see --help.',
  );

  const linksValidator = await prompter.confirm({
    message: 'Run starlight-links-validator on every build?',
    initialValue: defaults.linksValidator,
    active: 'Yes (catches broken links; slower)',
    inactive: 'No (faster builds)',
  });
  if (linksValidator === null) return err(WIZARD_CANCELLED);

  const cards = await prompter.select<'mdx' | 'html' | 'skip'>({
    message: 'Card and grid output',
    options: [
      { value: 'html', label: 'HTML + CSS shim', hint: 'default' },
      { value: 'mdx', label: 'Starlight <Card> / <CardGrid> MDX' },
      { value: 'skip', label: 'Skip cards entirely' },
    ],
    initialValue: defaults.cards,
  });
  if (cards === null) return err(WIZARD_CANCELLED);

  const mdxMode = await prompter.select<'auto' | 'always' | 'never'>({
    message: 'When to promote pages to .mdx',
    options: [
      { value: 'auto', label: 'Auto', hint: 'default; promote when JSX/imports detected' },
      { value: 'always', label: 'Always', hint: 'every page becomes .mdx' },
      { value: 'never', label: 'Never', hint: 'keep .md; may break embedded JSX' },
    ],
    initialValue: defaults.mdxMode,
  });
  if (mdxMode === null) return err(WIZARD_CANCELLED);

  const configFormat = await prompter.select<'mjs' | 'ts'>({
    message: 'Astro config format',
    options: [
      { value: 'mjs', label: 'astro.config.mjs', hint: 'default' },
      { value: 'ts', label: 'astro.config.ts', hint: 'typed' },
    ],
    initialValue: defaults.configFormat,
  });
  if (configFormat === null) return err(WIZARD_CANCELLED);

  return ok({ linksValidator, cards, mdxMode, configFormat });
}

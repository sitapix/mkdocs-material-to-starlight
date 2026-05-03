/**
 * The wizard orchestrator. Pure: takes a Prompter port and a ConversionPlan,
 * returns a Result wrapping WizardAnswers or WIZARD_CANCELLED.
 *
 * Flow:
 *   Tier 0 (always): outputDir, packageManager, check, final-confirm
 *   Tier 1 (conditional, driven by tier1Trigger): tabs (this task);
 *     remaining 7 added in Task 6b
 *   Tier 2 (advanced, gated by a final select): added in Task 6b
 *
 * Cancellation: any prompt returning null short-circuits to err(WIZARD_CANCELLED).
 *
 * `projectDir` is an INPUT (the caller chose it before loading mkdocs.yml to
 * build the ConversionPlan). The wizard does not re-prompt for it.
 */

import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import {
  type DefaultAnswers,
  type PackageManager,
  type WizardAnswers,
  type WizardCancelled,
  WIZARD_CANCELLED,
} from '../../domain/wizard/answers.js';
import { type Result, err, ok } from '../../domain/result.js';
import { deriveOutputDirName } from './derive-defaults.js';
import { triggerSet } from './tier1-trigger.js';

export interface RunWizardInput {
  /** Project directory chosen *before* entering the wizard (so the caller can
   *  read mkdocs.yml and build the ConversionPlan). The wizard treats this as
   *  fixed input and does not re-prompt for it. */
  readonly projectDir: string;
  readonly plan: ConversionPlan;
  readonly defaults: DefaultAnswers;
  readonly prompter: Prompter;
}

export async function runWizard(
  input: RunWizardInput,
): Promise<Result<WizardAnswers, WizardCancelled>> {
  const { projectDir, plan, defaults, prompter } = input;

  prompter.intro('mkdocs-to-starlight');

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

  const triggers = triggerSet(plan);
  let tabsAnswer = defaults.tabs;

  if (triggers.includes('tabs')) {
    const tabs = await prompter.select<'mdx' | 'html'>({
      message:
        'Tabs strategy — `content.tabs.link` is enabled in your mkdocs.yml',
      options: [
        { value: 'mdx', label: 'MDX <Tabs syncKey> (recommended; cross-page sync)' },
        { value: 'html', label: 'Plain HTML (no sync, no MDX requirement)' },
      ],
      initialValue: defaults.tabs,
    });
    if (tabs === null) return err(WIZARD_CANCELLED);
    tabsAnswer = tabs;
  }

  // Final confirm
  const action = await prompter.select<'apply' | 'cancel'>({
    message: 'Convert now?',
    options: [
      { value: 'apply', label: 'Convert' },
      { value: 'cancel', label: 'Cancel' },
    ],
    initialValue: 'apply',
  });
  if (action === null || action === 'cancel') return err(WIZARD_CANCELLED);

  return ok({
    projectDir,
    outputDir,
    packageManager,
    check,
    tabs: tabsAnswer,
    sidebarTopics: defaults.sidebarTopics,
    rss: defaults.rss,
    mikeVersions: defaults.mikeVersions,
    palette: defaults.palette,
    extraAssets: defaults.extraAssets,
    locales: defaults.locales,
    snippetBasePaths: defaults.snippetBasePaths,
    snippetMaxDepth: defaults.snippetMaxDepth,
    snippetDedentSubsections: defaults.snippetDedentSubsections,
    linksValidator: defaults.linksValidator,
    expressiveCodeTheme: defaults.expressiveCodeTheme,
    cards: defaults.cards,
    mdxMode: defaults.mdxMode,
    logoReplacesTitle: defaults.logoReplacesTitle,
    admonitionMapPath: defaults.admonitionMapPath,
    keepExplicitHeadingIds: defaults.keepExplicitHeadingIds,
    smartSymbols: defaults.smartSymbols,
    emojiShortcodes: defaults.emojiShortcodes,
    inlineMarks: defaults.inlineMarks,
    autoAppend: defaults.autoAppend,
    suppressRules: defaults.suppressRules,
    configFormat: defaults.configFormat,
    packageName: defaults.packageName,
  });
}

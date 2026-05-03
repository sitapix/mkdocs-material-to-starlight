/**
 * The wizard orchestrator. Pure: takes a Prompter port and a ConversionPlan,
 * returns a Result wrapping WizardAnswers or WIZARD_CANCELLED.
 *
 * Tiers are split into separate modules (`run-tier0.ts`, `run-tier1.ts`,
 * `run-tier2.ts`) to keep each function under the size cap.
 *
 * `projectDir` is an INPUT (the caller chose it before loading mkdocs.yml to
 * build the ConversionPlan). The wizard does not re-prompt for it.
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

  prompter.intro('mkdocs-to-starlight');

  const tier0 = await runTier0(prompter, plan, defaults);
  if (!tier0.ok) return tier0;

  const tier1 = await runTier1(prompter, plan, defaults);
  if (!tier1.ok) return tier1;

  // Decide whether to enter Tier 2 or skip straight to convert.
  const advanced = await prompter.select<'apply' | 'advanced' | 'cancel'>({
    message: 'Ready?',
    options: [
      { value: 'apply', label: 'Convert now' },
      { value: 'advanced', label: 'Show advanced options first' },
      { value: 'cancel', label: 'Cancel' },
    ],
    initialValue: 'apply',
  });
  if (advanced === null || advanced === 'cancel') return err(WIZARD_CANCELLED);

  let tier2: Partial<WizardAnswers> = {};
  if (advanced === 'advanced') {
    const t2 = await runTier2(prompter, defaults);
    if (!t2.ok) return t2;
    tier2 = t2.value;

    const finalAction = await prompter.select<'apply' | 'cancel'>({
      message: 'Convert now?',
      options: [
        { value: 'apply', label: 'Convert' },
        { value: 'cancel', label: 'Cancel' },
      ],
      initialValue: 'apply',
    });
    if (finalAction === null || finalAction === 'cancel') return err(WIZARD_CANCELLED);
  }

  return ok({
    projectDir,
    outputDir: tier0.value.outputDir,
    packageManager: tier0.value.packageManager,
    check: tier0.value.check,
    tabs: tier1.value.tabs ?? defaults.tabs,
    sidebarTopics: tier1.value.sidebarTopics ?? defaults.sidebarTopics,
    rss: tier1.value.rss ?? defaults.rss,
    mikeVersions: tier1.value.mikeVersions ?? defaults.mikeVersions,
    palette: tier1.value.palette ?? defaults.palette,
    extraAssets: tier1.value.extraAssets ?? defaults.extraAssets,
    locales: tier1.value.locales ?? defaults.locales,
    snippetBasePaths: tier1.value.snippetBasePaths ?? defaults.snippetBasePaths,
    snippetMaxDepth: tier2.snippetMaxDepth ?? defaults.snippetMaxDepth,
    snippetDedentSubsections: tier2.snippetDedentSubsections ?? defaults.snippetDedentSubsections,
    linksValidator: tier2.linksValidator ?? defaults.linksValidator,
    expressiveCodeTheme: tier2.expressiveCodeTheme ?? defaults.expressiveCodeTheme,
    cards: tier2.cards ?? defaults.cards,
    mdxMode: tier2.mdxMode ?? defaults.mdxMode,
    logoReplacesTitle: tier2.logoReplacesTitle ?? defaults.logoReplacesTitle,
    admonitionMapPath: tier2.admonitionMapPath ?? defaults.admonitionMapPath,
    keepExplicitHeadingIds: tier2.keepExplicitHeadingIds ?? defaults.keepExplicitHeadingIds,
    smartSymbols: tier2.smartSymbols ?? defaults.smartSymbols,
    emojiShortcodes: tier2.emojiShortcodes ?? defaults.emojiShortcodes,
    inlineMarks: tier2.inlineMarks ?? defaults.inlineMarks,
    autoAppend: tier2.autoAppend ?? defaults.autoAppend,
    suppressRules: tier2.suppressRules ?? defaults.suppressRules,
    configFormat: tier2.configFormat ?? defaults.configFormat,
    packageName: tier2.packageName ?? defaults.packageName,
  });
}

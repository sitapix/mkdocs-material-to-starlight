import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import {
  type DefaultAnswers,
  type WizardAnswers,
  type WizardCancelled,
  WIZARD_CANCELLED,
} from '../../domain/wizard/answers.js';
import { type Result, err, ok } from '../../domain/result.js';
import { triggerSet } from './tier1-trigger.js';

/** Mutable accumulator — assigned field-by-field, then frozen into Partial<WizardAnswers>. */
type Tier1Acc = { -readonly [K in keyof WizardAnswers]?: WizardAnswers[K] };

/**
 * Tier 1: prompts that fire only when a related feature is detected in the
 * mkdocs config. Each prompt:
 *   - leads with WHAT the user is choosing in the message,
 *   - moves "(recommended)" and detection rationale into the option `hint`
 *     so the primary label stays short and scannable,
 *   - has a sensible default pre-selected (so pressing Enter is the fast
 *     path for users who don't want to think).
 */
export async function runTier1(
  prompter: Prompter,
  plan: ConversionPlan,
  defaults: DefaultAnswers,
): Promise<Result<Partial<WizardAnswers>, WizardCancelled>> {
  const triggers = triggerSet(plan);
  const acc: Tier1Acc = {};

  if (triggers.includes('tabs')) {
    prompter.log.step('Detected: content.tabs.link (linked tabs).');
    const tabs = await prompter.select<'mdx' | 'html'>({
      message: 'Tabs output',
      options: [
        { value: 'mdx', label: 'MDX <Tabs syncKey>', hint: 'recommended; cross-page sync' },
        { value: 'html', label: 'Plain HTML', hint: 'no sync, no MDX requirement' },
      ],
      initialValue: defaults.tabs,
    });
    if (tabs === null) return err(WIZARD_CANCELLED);
    acc.tabs = tabs;
  }

  if (triggers.includes('sidebar-topics')) {
    prompter.log.step('Detected: navigation.tabs (top-level grouping).');
    const v = await prompter.confirm({
      message: 'Split sidebar by top-level group?',
      initialValue: defaults.sidebarTopics,
      active: 'Yes (installs starlight-sidebar-topics)',
      inactive: 'No (single sidebar)',
    });
    if (v === null) return err(WIZARD_CANCELLED);
    acc.sidebarTopics = v;
  }

  if (triggers.includes('snippets')) {
    if (plan.snippetCandidateDirs.length > 0) {
      prompter.log.step('Detected: pymdownx.snippets.');
      const v = await prompter.multiselect({
        message: 'Snippet base paths to resolve',
        options: plan.snippetCandidateDirs.map((d) => ({ value: d, label: d })),
        initialValues: plan.snippetCandidateDirs,
      });
      if (v === null) return err(WIZARD_CANCELLED);
      acc.snippetBasePaths = v;
    }
  }

  if (triggers.includes('rss')) {
    prompter.log.step('Detected: rss plugin.');
    const v = await prompter.confirm({
      message: 'Generate src/pages/rss.xml.ts endpoint?',
      initialValue: defaults.rss,
    });
    if (v === null) return err(WIZARD_CANCELLED);
    acc.rss = v;
  }

  if (triggers.includes('i18n')) {
    if (plan.detectedLocales.length > 0) {
      prompter.log.step(
        `Detected: i18n plugin with ${String(plan.detectedLocales.length)} locale${plan.detectedLocales.length === 1 ? '' : 's'}.`,
      );
      // Big i18n sites (fastapi, etc.) ship with 30+ locales. Switch to the
      // type-ahead variant once the list outgrows what fits comfortably on a
      // single terminal screen so users can filter rather than scroll.
      const useAutocomplete = plan.detectedLocales.length > 8;
      const localeOptions = plan.detectedLocales.map((l) => ({ value: l, label: l }));
      const v = useAutocomplete
        ? await prompter.autocompleteMultiselect({
            message: 'Locales to carry over (type to filter)',
            options: localeOptions,
            initialValues: plan.detectedLocales,
            placeholder: 'e.g. en, de, fr',
          })
        : await prompter.multiselect({
            message: 'Locales to carry over',
            options: localeOptions,
            initialValues: plan.detectedLocales,
            maxItems: 8,
          });
      if (v === null) return err(WIZARD_CANCELLED);
      acc.locales = v;
    }
  }

  if (triggers.includes('mike')) {
    prompter.log.step('Detected: mike (versioned docs).');
    const v = await prompter.text({
      message: 'Mike versions (comma-separated slugs)',
      placeholder: 'v1,v2,latest',
      initialValue: defaults.mikeVersions.join(','),
    });
    if (v === null) return err(WIZARD_CANCELLED);
    acc.mikeVersions = v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  if (triggers.includes('palette')) {
    prompter.log.step('Detected: theme.palette.');
    const v = await prompter.select<'translate' | 'skip' | 'custom'>({
      message: 'Color palette',
      options: [
        { value: 'translate', label: 'Translate to Starlight accent', hint: 'recommended' },
        { value: 'skip', label: 'Use Starlight default accent' },
        { value: 'custom', label: 'I will write the accent CSS myself' },
      ],
      initialValue: defaults.palette,
    });
    if (v === null) return err(WIZARD_CANCELLED);
    acc.palette = v;
  }

  if (triggers.includes('extra-assets')) {
    const all = [...plan.detectedExtraCss, ...plan.detectedExtraJs];
    if (all.length > 0) {
      prompter.log.step(
        `Detected: ${String(all.length)} extra CSS/JS asset${all.length === 1 ? '' : 's'}.`,
      );
      const useAutocomplete = all.length > 8;
      const assetOptions = all.map((p) => ({ value: p, label: p }));
      const v = useAutocomplete
        ? await prompter.autocompleteMultiselect({
            message: 'Carry over which extra assets? (type to filter)',
            options: assetOptions,
            initialValues: all,
            placeholder: 'e.g. extra.css',
          })
        : await prompter.multiselect({
            message: 'Carry over which extra assets?',
            options: assetOptions,
            initialValues: all,
            maxItems: 8,
          });
      if (v === null) return err(WIZARD_CANCELLED);
      acc.extraAssets = v;
    }
  }

  return ok(acc);
}

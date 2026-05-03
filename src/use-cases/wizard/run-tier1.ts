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

export async function runTier1(
  prompter: Prompter,
  plan: ConversionPlan,
  defaults: DefaultAnswers,
): Promise<Result<Partial<WizardAnswers>, WizardCancelled>> {
  const triggers = triggerSet(plan);
  const acc: Tier1Acc = {};

  if (triggers.includes('tabs')) {
    const tabs = await prompter.select<'mdx' | 'html'>({
      message: 'Tabs strategy — `content.tabs.link` is enabled in your mkdocs.yml',
      options: [
        { value: 'mdx', label: 'MDX <Tabs syncKey> (recommended; cross-page sync)' },
        { value: 'html', label: 'Plain HTML (no sync, no MDX requirement)' },
      ],
      initialValue: defaults.tabs,
    });
    if (tabs === null) return err(WIZARD_CANCELLED);
    acc.tabs = tabs;
  }

  if (triggers.includes('sidebar-topics')) {
    const v = await prompter.confirm({
      message:
        'Install `starlight-sidebar-topics` and split sidebar by top-level group? (`navigation.tabs` is enabled)',
      initialValue: defaults.sidebarTopics,
    });
    if (v === null) return err(WIZARD_CANCELLED);
    acc.sidebarTopics = v;
  }

  if (triggers.includes('snippets')) {
    if (plan.snippetCandidateDirs.length > 0) {
      const v = await prompter.multiselect({
        message: 'Snippet base paths (resolves PyMdown snippet includes)',
        options: plan.snippetCandidateDirs.map((d) => ({ value: d, label: d })),
        initialValues: plan.snippetCandidateDirs,
      });
      if (v === null) return err(WIZARD_CANCELLED);
      acc.snippetBasePaths = v;
    }
  }

  if (triggers.includes('rss')) {
    const v = await prompter.confirm({
      message: 'Generate `src/pages/rss.xml.ts` endpoint? (rss plugin detected)',
      initialValue: defaults.rss,
    });
    if (v === null) return err(WIZARD_CANCELLED);
    acc.rss = v;
  }

  if (triggers.includes('i18n')) {
    if (plan.detectedLocales.length > 0) {
      const v = await prompter.multiselect({
        message: 'Locales to carry over',
        options: plan.detectedLocales.map((l) => ({ value: l, label: l })),
        initialValues: plan.detectedLocales,
      });
      if (v === null) return err(WIZARD_CANCELLED);
      acc.locales = v;
    }
  }

  if (triggers.includes('mike')) {
    const v = await prompter.text({
      message: 'Mike versions (comma-separated slugs, e.g. `v1,v2,latest`)',
      initialValue: defaults.mikeVersions.join(','),
    });
    if (v === null) return err(WIZARD_CANCELLED);
    acc.mikeVersions = v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  if (triggers.includes('palette')) {
    const v = await prompter.select<'translate' | 'skip' | 'custom'>({
      message: 'Material palette translation',
      options: [
        { value: 'translate', label: 'Translate to Starlight accent (recommended)' },
        { value: 'skip', label: 'Skip — use Starlight default accent' },
        { value: 'custom', label: 'Skip — I will write the accent vars myself' },
      ],
      initialValue: defaults.palette,
    });
    if (v === null) return err(WIZARD_CANCELLED);
    acc.palette = v;
  }

  if (triggers.includes('extra-assets')) {
    const all = [...plan.detectedExtraCss, ...plan.detectedExtraJs];
    if (all.length > 0) {
      const v = await prompter.multiselect({
        message: 'Carry over which `extra_css` / `extra_javascript` entries?',
        options: all.map((p) => ({ value: p, label: p })),
        initialValues: all,
      });
      if (v === null) return err(WIZARD_CANCELLED);
      acc.extraAssets = v;
    }
  }

  return ok(acc);
}

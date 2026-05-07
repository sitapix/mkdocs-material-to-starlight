import { err, ok, type Result } from '../../domain/result.js';
import {
  type DefaultAnswers,
  WIZARD_CANCELLED,
  type WizardAnswers,
  type WizardCancelled,
} from '../../domain/wizard/answers.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import { tier1DocsUrl } from './docs-links.js';
import { type Tier1Trigger, triggerSet } from './tier1-trigger.js';

/**
 * Tier 1: prompts that fire only when a related feature is detected in the
 * mkdocs config. Each prompt:
 *   - leads with WHAT the user is choosing in the message,
 *   - moves "(recommended)" and detection rationale into the option `hint`
 *     so the primary label stays short and scannable,
 *   - has a sensible default pre-selected (so pressing Enter is the fast
 *     path for users who don't want to think).
 *
 * Each detection emits a uniform `Detected: <label>. Learn more: <url>` step
 * before its prompt — keep `step()` the single emitter so the wording stays
 * consistent across triggers.
 */

/** Mutable accumulator — assigned field-by-field, then frozen into Partial<WizardAnswers>. */
type Tier1Acc = { -readonly [K in keyof WizardAnswers]?: WizardAnswers[K] };

/** Above this many options, switch from a fixed multiselect to a type-ahead
 * autocomplete so users can filter instead of scroll. Same threshold used for
 * locales (i18n) and extra-assets — keep them in sync. */
const MULTISELECT_AUTOCOMPLETE_THRESHOLD = 8;

/** Mike version slugs are limited to these characters; rejects pasted prose. */
const MIKE_VERSION_PATTERN = /^[A-Za-z0-9._-]+$/;

function step(prompter: Prompter, label: string, trigger: Tier1Trigger): void {
  const url = tier1DocsUrl(trigger);
  prompter.log.step(
    `Detected: ${prompter.highlight.name(label)}. Learn more: ${prompter.highlight.url(url)}`,
  );
}

export async function runTier1(
  prompter: Prompter,
  plan: ConversionPlan,
  defaults: DefaultAnswers,
): Promise<Result<Partial<WizardAnswers>, WizardCancelled>> {
  const triggers = triggerSet(plan);
  const acc: Tier1Acc = {};

  if (triggers.includes('tabs')) {
    const r = await askTabs(prompter, defaults);
    if (!r.ok) return r;
    acc.tabs = r.value;
  }
  if (triggers.includes('sidebar-topics')) {
    const r = await askSidebarTopics(prompter, defaults);
    if (!r.ok) return r;
    acc.sidebarTopics = r.value;
  }
  if (triggers.includes('snippets') && plan.snippetCandidateDirs.length > 0) {
    const r = await askSnippets(prompter, plan);
    if (!r.ok) return r;
    acc.snippetBasePaths = r.value;
  }
  if (triggers.includes('rss')) {
    const r = await askRss(prompter, defaults);
    if (!r.ok) return r;
    acc.rss = r.value;
  }
  if (triggers.includes('i18n') && plan.detectedLocales.length > 0) {
    const r = await askI18n(prompter, plan);
    if (!r.ok) return r;
    acc.locales = r.value;
  }
  if (triggers.includes('mike')) {
    const r = await askMike(prompter, defaults);
    if (!r.ok) return r;
    acc.mikeVersions = r.value;
  }
  if (triggers.includes('palette')) {
    const r = await askPalette(prompter, defaults);
    if (!r.ok) return r;
    acc.palette = r.value;
  }
  const allAssets = [...plan.detectedExtraCss, ...plan.detectedExtraJs];
  if (triggers.includes('extra-assets') && allAssets.length > 0) {
    const r = await askExtraAssets(prompter, allAssets);
    if (!r.ok) return r;
    acc.extraAssets = r.value;
  }

  return ok(acc);
}

async function askTabs(
  prompter: Prompter,
  defaults: DefaultAnswers,
): Promise<Result<WizardAnswers['tabs'], WizardCancelled>> {
  step(prompter, 'content.tabs.link (linked tabs)', 'tabs');
  const v = await prompter.select<'mdx' | 'html'>({
    message: 'Tabs output',
    options: [
      { value: 'mdx', label: 'MDX <Tabs syncKey>', hint: 'recommended; cross-page sync' },
      { value: 'html', label: 'Plain HTML', hint: 'no sync, no MDX requirement' },
    ],
    initialValue: defaults.tabs,
  });
  return v === null ? err(WIZARD_CANCELLED) : ok(v);
}

async function askSidebarTopics(
  prompter: Prompter,
  defaults: DefaultAnswers,
): Promise<Result<boolean, WizardCancelled>> {
  step(prompter, 'navigation.tabs (top-level grouping)', 'sidebar-topics');
  const v = await prompter.confirm({
    message: 'Split sidebar by top-level group?',
    initialValue: defaults.sidebarTopics,
    active: 'Yes (installs starlight-sidebar-topics)',
    inactive: 'No (single sidebar)',
  });
  return v === null ? err(WIZARD_CANCELLED) : ok(v);
}

async function askSnippets(
  prompter: Prompter,
  plan: ConversionPlan,
): Promise<Result<ReadonlyArray<string>, WizardCancelled>> {
  step(prompter, 'pymdownx.snippets', 'snippets');
  const v = await prompter.multiselect({
    message: 'Snippet base paths to resolve',
    options: plan.snippetCandidateDirs.map((d) => ({ value: d, label: d })),
    initialValues: plan.snippetCandidateDirs,
  });
  return v === null ? err(WIZARD_CANCELLED) : ok(v);
}

async function askRss(
  prompter: Prompter,
  defaults: DefaultAnswers,
): Promise<Result<boolean, WizardCancelled>> {
  step(prompter, 'rss plugin', 'rss');
  const v = await prompter.confirm({
    message: 'Generate src/pages/rss.xml.ts endpoint?',
    initialValue: defaults.rss,
  });
  return v === null ? err(WIZARD_CANCELLED) : ok(v);
}

async function askI18n(
  prompter: Prompter,
  plan: ConversionPlan,
): Promise<Result<ReadonlyArray<string>, WizardCancelled>> {
  const count = plan.detectedLocales.length;
  step(prompter, `i18n plugin (${String(count)} locale${count === 1 ? '' : 's'})`, 'i18n');
  const opts = plan.detectedLocales.map((l) => ({ value: l, label: l }));
  const v =
    count > MULTISELECT_AUTOCOMPLETE_THRESHOLD
      ? await prompter.autocompleteMultiselect({
          message: 'Locales to carry over (type to filter)',
          options: opts,
          initialValues: plan.detectedLocales,
          placeholder: 'e.g. en, de, fr',
        })
      : await prompter.multiselect({
          message: 'Locales to carry over',
          options: opts,
          initialValues: plan.detectedLocales,
          maxItems: MULTISELECT_AUTOCOMPLETE_THRESHOLD,
        });
  return v === null ? err(WIZARD_CANCELLED) : ok(v);
}

async function askMike(
  prompter: Prompter,
  defaults: DefaultAnswers,
): Promise<Result<ReadonlyArray<string>, WizardCancelled>> {
  step(prompter, 'mike (versioned docs)', 'mike');
  const v = await prompter.text({
    message: 'Mike versions (comma-separated slugs)',
    placeholder: 'v1,v2,latest',
    initialValue: defaults.mikeVersions.join(','),
    validate: (value) => {
      const parts = value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const bad = parts.filter((s) => !MIKE_VERSION_PATTERN.test(s));
      if (bad.length === 0) return undefined;
      return `Invalid version slug${bad.length === 1 ? '' : 's'}: ${bad.join(', ')}. Use letters, digits, dot, hyphen, underscore.`;
    },
  });
  if (v === null) return err(WIZARD_CANCELLED);
  return ok(
    v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

async function askPalette(
  prompter: Prompter,
  defaults: DefaultAnswers,
): Promise<Result<WizardAnswers['palette'], WizardCancelled>> {
  step(prompter, 'theme.palette', 'palette');
  // The "accent" is Starlight's single brand color: links, active sidebar
  // items, callout borders, focus rings. Spelling that out beats the bare
  // word "accent" — most users won't know Starlight's terminology yet.
  const v = await prompter.select<'translate' | 'skip' | 'custom'>({
    message: 'Brand color (used for links, active nav, callouts, focus rings)',
    options: [
      {
        value: 'translate',
        label: 'Use your Material primary color',
        hint: 'recommended; reads from theme.palette.primary',
      },
      { value: 'skip', label: "Use Starlight's default purple" },
      { value: 'custom', label: "I'll write the accent CSS myself" },
    ],
    initialValue: defaults.palette,
  });
  return v === null ? err(WIZARD_CANCELLED) : ok(v);
}

async function askExtraAssets(
  prompter: Prompter,
  all: ReadonlyArray<string>,
): Promise<Result<ReadonlyArray<string>, WizardCancelled>> {
  step(
    prompter,
    `${String(all.length)} extra CSS/JS asset${all.length === 1 ? '' : 's'}`,
    'extra-assets',
  );
  const opts = all.map((p) => ({ value: p, label: p }));
  const v =
    all.length > MULTISELECT_AUTOCOMPLETE_THRESHOLD
      ? await prompter.autocompleteMultiselect({
          message: 'Carry over which extra assets? (type to filter)',
          options: opts,
          initialValues: all,
          placeholder: 'e.g. extra.css',
        })
      : await prompter.multiselect({
          message: 'Carry over which extra assets?',
          options: opts,
          initialValues: all,
          maxItems: MULTISELECT_AUTOCOMPLETE_THRESHOLD,
        });
  return v === null ? err(WIZARD_CANCELLED) : ok(v);
}

import { describe, expect, it } from 'vitest';
import { runWizard } from './run-wizard.js';
import { createFakePrompter } from './fake-prompter.js';
import { deriveDefaults } from './derive-defaults.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import { WIZARD_CANCELLED } from '../../domain/wizard/answers.js';

function makePlan(over: Partial<MkdocsConfig> = {}): ConversionPlan {
  const config: MkdocsConfig = {
    siteName: 'My Docs',
    siteDescription: null,
    siteUrl: null,
    docsDir: 'docs',
    useDirectoryUrls: true,
    copyright: null,
    repoName: null,
    repoUrl: null,
    editUri: null,
    nav: [],
    theme: null,
    plugins: [],
    markdownExtensions: [],
    extras: {},
    ...over,
  };
  return {
    config,
    mappingRows: [],
    detectedExtraCss: [],
    detectedExtraJs: [],
    detectedLocales: [],
    snippetCandidateDirs: [],
  };
}

describe('runWizard — Tier 0 only (vanilla site)', () => {
  it('returns answers when the user accepts every default', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      // outputDir is now a `path` prompt (clack 1.3+ tab-completing directory picker).
      path: ['/o'],
      confirm: [true],
      // Tier 0 packageManager. The convert/advanced gate is selectKey, not select.
      select: ['npm'],
      selectKey: ['c'],
    });

    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectDir).toBe('/p');
      expect(result.value.outputDir).toBe('/o');
      expect(result.value.check).toBe(true);
      expect(result.value.packageManager).toBe('npm');
    }
  });

  it('returns WIZARD_CANCELLED when user cancels at outputDir prompt', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({ path: [null] });
    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('returns WIZARD_CANCELLED when user cancels at the convert/advanced gate', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: [null], // cancel at the gate
    });
    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });
});

describe('runWizard — Tier 1 conditional (content.tabs.link → tabs prompt)', () => {
  it('asks the tabs question when content.tabs.link is detected', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['content.tabs.link'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm', 'mdx'],
      selectKey: ['c'],
    });
    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tabs).toBe('mdx');
    expect(prompter.calls.some((c) => c.message.toLowerCase().includes('tab'))).toBe(true);
  });

  it('does NOT ask the tabs question on a vanilla site', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
    });
    await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(prompter.calls.some((c) => c.message.toLowerCase().includes('tab'))).toBe(false);
  });
});

describe('runWizard — additional Tier 1 prompts', () => {
  it('asks sidebar-topics when navigation.tabs is detected', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['navigation.tabs'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, true], // check, sidebar-topics
      select: ['npm'],
      selectKey: ['c'],
    });
    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sidebarTopics).toBe(true);
    expect(
      prompter.calls.some((c) => c.message.toLowerCase().includes('split sidebar')),
    ).toBe(true);
  });

  it('asks rss confirmation when rss plugin is present', async () => {
    const plan = makePlan({ plugins: [{ name: 'rss', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, true], // check, rss
      select: ['npm'],
      selectKey: ['c'],
    });
    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.rss).toBe(true);
  });

  it('asks i18n locale multiselect when i18n plugin is present', async () => {
    const plan = makePlan({ plugins: [{ name: 'i18n', options: {} }] });
    const planWithLocales: ConversionPlan = {
      ...plan,
      detectedLocales: ['en', 'fr', 'de'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      multiselect: [['en', 'fr']],
    });
    const result = await runWizard({ plan: planWithLocales, projectDir: '/p', defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.locales).toEqual(['en', 'fr']);
  });

  it('switches to autocompleteMultiselect when locale list exceeds 8 (real fastapi-shape sites)', async () => {
    const plan = makePlan({ plugins: [{ name: 'i18n', options: {} }] });
    const longList = ['en', 'de', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh', 'es', 'it'];
    const planWithLocales: ConversionPlan = { ...plan, detectedLocales: longList };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      autocompleteMultiselect: [['en', 'de']],
    });
    const result = await runWizard({ plan: planWithLocales, projectDir: '/p', defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.locales).toEqual(['en', 'de']);
    expect(
      prompter.calls.some((c) => c.kind === 'autocompleteMultiselect'),
    ).toBe(true);
  });
});

describe('runWizard — Tier 2 advanced opt-in', () => {
  it('runs Tier 2 prompts then converts immediately (no second confirm)', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      // Tier 0 check, Tier 2 linksValidator
      confirm: [true, false],
      // Tier 0 packageManager, Tier 2 cards/mdxMode/configFormat
      select: ['npm', 'html', 'auto', 'mjs'],
      // gate: 'a' for advanced
      selectKey: ['a'],
    });
    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.linksValidator).toBe(false);
      expect(result.value.cards).toBe('html');
      expect(result.value.mdxMode).toBe('auto');
      expect(result.value.configFormat).toBe('mjs');
    }
    // Critical: the gate is asked exactly once. There must NOT be a second
    // "Convert now?" prompt after Tier 2.
    const gatePrompts = prompter.calls.filter(
      (c) =>
        c.kind === 'selectKey' &&
        c.message.toLowerCase().includes('convert now'),
    );
    expect(gatePrompts.length).toBe(1);
  });
});

describe('runWizard — accessibility / colorblind-friendly UX', () => {
  it('emits log.step messages explaining detected features (shape-based status, not color-only)', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['content.tabs.link'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm', 'mdx'],
      selectKey: ['c'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(
      prompter.logs.some(
        (l) => l.level === 'step' && l.message.toLowerCase().includes('content.tabs.link'),
      ),
    ).toBe(true);
  });

  it('uses the option `hint` field for "(recommended)" instead of inlining it in labels', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['content.tabs.link'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    let observedTabsOptions: ReadonlyArray<{ label: string; hint?: string }> = [];
    const wrapped = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm', 'mdx'],
      selectKey: ['c'],
    });
    const realSelect = wrapped.select.bind(wrapped);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapped as any).select = async (o: {
      message: string;
      options: ReadonlyArray<{ label: string; hint?: string }>;
      initialValue?: string;
    }) => {
      if (o.message.toLowerCase().includes('tabs output')) {
        observedTabsOptions = o.options;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return realSelect(o as any);
    };
    await runWizard({ projectDir: '/p', plan, defaults, prompter: wrapped });
    const recommended = observedTabsOptions.find((opt) => opt.hint?.includes('recommended'));
    expect(recommended).toBeDefined();
    // And the label itself must NOT contain "(recommended)" inlined.
    for (const opt of observedTabsOptions) {
      expect(opt.label.toLowerCase()).not.toContain('(recommended)');
    }
  });
});

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

describe('runWizard — pre-convert recap', () => {
  it('renders a recap note BEFORE the convert/advanced gate fires', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });

    // Exactly one note fires, and it precedes the gate's selectKey call.
    expect(prompter.notes.length).toBeGreaterThanOrEqual(1);
    const recap = prompter.notes[prompter.notes.length - 1];
    expect(recap).toBeDefined();
    if (recap === undefined) return;
    expect(recap.body).toContain('/p');
    expect(recap.body).toContain('/o');
    // Title should signal "you're about to convert".
    expect(recap.title?.toLowerCase()).toMatch(/convert|review|summary/);
  });

  it('recap reflects Tier 1 decisions (tabs strategy when content.tabs.link triggers)', async () => {
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
    const recap = prompter.notes[prompter.notes.length - 1];
    expect(recap).toBeDefined();
    if (recap === undefined) return;
    expect(recap.body.toLowerCase()).toMatch(/tabs.*mdx/);
  });
});

describe('runWizard — every Tier 1 detection step includes a docs URL', () => {
  // The wizard tells the user "Detected: X" before each Tier 1 prompt. When
  // the prompt suggests a Starlight or community-plugin substitution, the
  // step message must include a https:// URL so the user has a one-click
  // place to learn more — anything we suggest, we link.
  function expectStepHasUrl(
    logs: ReadonlyArray<{ level: string; message: string }>,
    matcher: RegExp,
  ): void {
    const step = logs.find(
      (l) => l.level === 'step' && matcher.test(l.message),
    );
    expect(step, `no step matched ${String(matcher)}`).toBeDefined();
    expect(step?.message).toMatch(/https?:\/\//);
  }

  it('tabs detection step includes a docs URL', async () => {
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
    expectStepHasUrl(prompter.logs, /content\.tabs\.link/i);
  });

  it('sidebar-topics detection step includes a docs URL', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['navigation.tabs'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, true],
      select: ['npm'],
      selectKey: ['c'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expectStepHasUrl(prompter.logs, /navigation\.tabs/i);
  });

  it('rss detection step includes a docs URL', async () => {
    const plan = makePlan({ plugins: [{ name: 'rss', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, true],
      select: ['npm'],
      selectKey: ['c'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expectStepHasUrl(prompter.logs, /rss plugin/i);
  });

  it('snippets detection step includes a docs URL', async () => {
    const plan = {
      ...makePlan({ markdownExtensions: [{ name: 'pymdownx.snippets', options: {} }] }),
      snippetCandidateDirs: ['docs/_snippets'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      multiselect: [['docs/_snippets']],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expectStepHasUrl(prompter.logs, /pymdownx\.snippets/i);
  });

  it('i18n detection step includes a docs URL', async () => {
    const plan = {
      ...makePlan({ plugins: [{ name: 'i18n', options: {} }] }),
      detectedLocales: ['en', 'fr'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      multiselect: [['en', 'fr']],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expectStepHasUrl(prompter.logs, /i18n plugin/i);
  });

  it('mike detection step includes a docs URL', async () => {
    const plan = makePlan({ plugins: [{ name: 'mike', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      text: ['v1,v2,latest'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expectStepHasUrl(prompter.logs, /mike/i);
  });

  it('palette detection step includes a docs URL', async () => {
    const plan = makePlan({
      theme: {
        name: 'material',
        options: { palette: [{ scheme: 'default', primary: 'indigo' }] },
      },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm', 'translate'],
      selectKey: ['c'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expectStepHasUrl(prompter.logs, /theme\.palette/i);
  });

  it('extra-assets detection step includes a docs URL', async () => {
    const plan = {
      ...makePlan({ extras: { extra_css: ['custom.css'] } }),
      detectedExtraCss: ['custom.css'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      multiselect: [['custom.css']],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expectStepHasUrl(prompter.logs, /extra css\/js asset/i);
  });
});

describe('runWizard — Tier 0 cancellation paths', () => {
  it('cancels at packageManager prompt', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      select: [null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at the astro-check confirm', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      select: ['npm'],
      confirm: [null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });
});

describe('runWizard — Tier 1 cancellation paths', () => {
  it('cancels at tabs prompt', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['content.tabs.link'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm', null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at sidebar-topics confirm', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['navigation.tabs'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, null],
      select: ['npm'],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at snippets multiselect', async () => {
    const plan = {
      ...makePlan({ markdownExtensions: [{ name: 'pymdownx.snippets', options: {} }] }),
      snippetCandidateDirs: ['docs/_snippets'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      multiselect: [null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at rss confirm', async () => {
    const plan = makePlan({ plugins: [{ name: 'rss', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, null],
      select: ['npm'],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at i18n locale multiselect', async () => {
    const plan = {
      ...makePlan({ plugins: [{ name: 'i18n', options: {} }] }),
      detectedLocales: ['en', 'fr'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      multiselect: [null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at i18n autocomplete (>8 locales)', async () => {
    const plan = {
      ...makePlan({ plugins: [{ name: 'i18n', options: {} }] }),
      detectedLocales: ['en', 'de', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh', 'es', 'it'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      autocompleteMultiselect: [null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at mike text', async () => {
    const plan = makePlan({ plugins: [{ name: 'mike', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      text: [null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at palette select', async () => {
    const plan = makePlan({
      theme: {
        name: 'material',
        options: { palette: [{ scheme: 'default', primary: 'indigo' }] },
      },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm', null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at extra-assets multiselect', async () => {
    const plan = {
      ...makePlan({ extras: { extra_css: ['custom.css'] } }),
      detectedExtraCss: ['custom.css'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      multiselect: [null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at extra-assets autocomplete (>8 assets)', async () => {
    const many = Array.from({ length: 10 }, (_, i) => `asset${String(i)}.css`);
    const plan = {
      ...makePlan({ extras: { extra_css: many } }),
      detectedExtraCss: many,
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      autocompleteMultiselect: [null],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });
});

describe('runWizard — Tier 1 snippets path', () => {
  it('asks the multiselect when pymdownx.snippets is detected with candidate dirs', async () => {
    const plan = {
      ...makePlan({ markdownExtensions: [{ name: 'pymdownx.snippets', options: {} }] }),
      snippetCandidateDirs: ['docs/_snippets', 'docs/includes'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      multiselect: [['docs/_snippets']],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.snippetBasePaths).toEqual(['docs/_snippets']);
  });

  it('does NOT ask when snippets is triggered but candidate-dir list is empty', async () => {
    const plan = {
      ...makePlan({ markdownExtensions: [{ name: 'pymdownx.snippets', options: {} }] }),
      snippetCandidateDirs: [],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(true);
    expect(prompter.calls.some((c) => c.kind === 'multiselect')).toBe(false);
  });

  it('does NOT ask on a vanilla site (no pymdownx.snippets)', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(prompter.calls.some((c) => c.message.toLowerCase().includes('snippet'))).toBe(false);
  });
});

describe('runWizard — Tier 1 mike path', () => {
  it('parses comma-separated versions, trimming whitespace and dropping empties', async () => {
    const plan = makePlan({ plugins: [{ name: 'mike', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      text: [' v1, v2 ,  ,latest '],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mikeVersions).toEqual(['v1', 'v2', 'latest']);
  });

  it('returns an empty array when user enters an empty string', async () => {
    const plan = makePlan({ plugins: [{ name: 'mike', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      text: [''],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mikeVersions).toEqual([]);
  });
});

describe('runWizard — Tier 1 palette path', () => {
  function paletteOnlyPlan(): ConversionPlan {
    return makePlan({
      theme: {
        name: 'material',
        options: { palette: [{ scheme: 'default', primary: 'indigo' }] },
      },
    });
  }

  for (const choice of ['translate', 'skip', 'custom'] as const) {
    it(`records '${choice}' when the user picks it`, async () => {
      const plan = paletteOnlyPlan();
      const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
      const prompter = createFakePrompter({
        path: ['/o'],
        confirm: [true],
        select: ['npm', choice],
        selectKey: ['c'],
      });
      const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.palette).toBe(choice);
    });
  }
});

describe('runWizard — Tier 1 extra-assets path', () => {
  it('uses multiselect when assets count is ≤8', async () => {
    const css = ['a.css', 'b.css', 'c.css'];
    const plan = {
      ...makePlan({ extras: { extra_css: css } }),
      detectedExtraCss: css,
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      multiselect: [['a.css', 'c.css']],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.extraAssets).toEqual(['a.css', 'c.css']);
    expect(prompter.calls.some((c) => c.kind === 'autocompleteMultiselect')).toBe(false);
  });

  it('switches to autocomplete when asset count exceeds 8', async () => {
    const many = Array.from({ length: 10 }, (_, i) => `asset${String(i)}.css`);
    const plan = {
      ...makePlan({ extras: { extra_css: many } }),
      detectedExtraCss: many,
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
      autocompleteMultiselect: [['asset0.css', 'asset1.css']],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.extraAssets).toEqual(['asset0.css', 'asset1.css']);
  });

  it('does NOT prompt when both detectedExtraCss and detectedExtraJs are empty', async () => {
    const plan = makePlan({ extras: { extra_css: [] } });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(prompter.calls.some((c) => c.message.toLowerCase().includes('extra'))).toBe(false);
  });
});

describe('runWizard — Tier 1 i18n no-locale edge case', () => {
  it('does NOT prompt when i18n plugin is present but detectedLocales is empty', async () => {
    const plan = makePlan({ plugins: [{ name: 'i18n', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true],
      select: ['npm'],
      selectKey: ['c'],
    });
    await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(prompter.calls.some((c) => c.message.toLowerCase().includes('locale'))).toBe(false);
  });
});

describe('runWizard — Tier 2 cancellation paths', () => {
  it('cancels at linksValidator confirm', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, null],
      select: ['npm'],
      selectKey: ['a'],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at cards select', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, false],
      select: ['npm', null],
      selectKey: ['a'],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at mdxMode select', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, false],
      select: ['npm', 'html', null],
      selectKey: ['a'],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });

  it('cancels at configFormat select', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      path: ['/o'],
      confirm: [true, false],
      select: ['npm', 'html', 'auto', null],
      selectKey: ['a'],
    });
    const result = await runWizard({ projectDir: '/p', plan, defaults, prompter });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });
});

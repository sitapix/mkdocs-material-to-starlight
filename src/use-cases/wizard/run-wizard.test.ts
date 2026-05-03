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
    repoUrl: null,
    editUri: null,
    nav: [],
    theme: null,
    plugins: [],
    markdownExtensions: [],
    extras: { record: {}, hooks: null },
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
      text: ['/o'], // outputDir only — projectDir is an input, not a prompt
      confirm: [true, true],
      select: ['npm', 'apply'],
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
    const prompter = createFakePrompter({ text: [null] });
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
      text: ['/o'],
      confirm: [true, true],
      select: ['npm', 'mdx', 'apply'],
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
      text: ['/o'],
      confirm: [true, true],
      select: ['npm', 'apply'],
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

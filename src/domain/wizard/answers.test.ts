import { describe, expect, it } from 'vitest';
import { type DefaultAnswers, WIZARD_CANCELLED, type WizardAnswers } from './answers.js';

describe('WizardAnswers', () => {
  it('accepts a fully-specified value', () => {
    const a: WizardAnswers = {
      projectDir: '/p',
      outputDir: '/o',
      packageManager: 'npm',
      check: true,
      tabs: 'mdx',
      sidebarTopics: false,
      rss: true,
      mikeVersions: [],
      palette: 'translate',
      extraAssets: [],
      locales: [],
      snippetBasePaths: [],
      snippetMaxDepth: 8,
      snippetDedentSubsections: false,
      linksValidator: true,
      expressiveCodeTheme: null,
      cards: 'html',
      mdxMode: 'auto',
      logoReplacesTitle: false,
      admonitionMapPath: null,
      keepExplicitHeadingIds: false,
      smartSymbols: true,
      emojiShortcodes: true,
      inlineMarks: true,
      autoAppend: true,
      suppressRules: [],
      configFormat: 'mjs',
      packageName: null,
    };
    expect(a.projectDir).toBe('/p');
  });

  it('exposes WIZARD_CANCELLED as a tagged sentinel', () => {
    expect(WIZARD_CANCELLED).toEqual({ tag: 'wizard-cancelled' });
  });

  it('DefaultAnswers is a subset of WizardAnswers (no projectDir/outputDir)', () => {
    const d: DefaultAnswers = {
      packageManager: 'pnpm',
      check: true,
      tabs: 'mdx',
      sidebarTopics: true,
      rss: true,
      mikeVersions: [],
      palette: 'translate',
      extraAssets: [],
      locales: [],
      snippetBasePaths: [],
      snippetMaxDepth: 8,
      snippetDedentSubsections: false,
      linksValidator: true,
      expressiveCodeTheme: null,
      cards: 'html',
      mdxMode: 'auto',
      logoReplacesTitle: false,
      admonitionMapPath: null,
      keepExplicitHeadingIds: false,
      smartSymbols: true,
      emojiShortcodes: true,
      inlineMarks: true,
      autoAppend: true,
      suppressRules: [],
      configFormat: 'mjs',
      packageName: null,
    };
    expect(d.packageManager).toBe('pnpm');
  });
});

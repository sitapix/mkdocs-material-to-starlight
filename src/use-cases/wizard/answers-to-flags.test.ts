import { describe, expect, it } from 'vitest';
import { answersToFlags } from './answers-to-flags.js';
import type { WizardAnswers } from '../../domain/wizard/answers.js';

const baseline: WizardAnswers = {
  projectDir: './project',
  outputDir: './output',
  packageManager: 'npm',
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

describe('answersToFlags', () => {
  it('emits only positionals when every answer matches the converter default', () => {
    expect(answersToFlags(baseline)).toEqual(['./project', './output']);
  });

  it('emits --no-check when check is disabled', () => {
    expect(answersToFlags({ ...baseline, check: false })).toContain('--no-check');
  });

  it('emits --tabs html only when non-default', () => {
    expect(answersToFlags({ ...baseline, tabs: 'html' })).toContain('--tabs=html');
  });

  it('emits --no-links-validator when disabled', () => {
    expect(answersToFlags({ ...baseline, linksValidator: false })).toContain(
      '--no-links-validator',
    );
  });

  it('repeats --snippet-base-path for each entry', () => {
    const flags = answersToFlags({
      ...baseline,
      snippetBasePaths: ['docs', 'overrides'],
    });
    expect(flags.filter((f) => f === '--snippet-base-path').length).toBe(2);
    expect(flags).toContain('docs');
    expect(flags).toContain('overrides');
  });

  it('emits --suppress for each suppressed rule', () => {
    const flags = answersToFlags({
      ...baseline,
      suppressRules: ['palette-translated', 'mdx-promotion'],
    });
    expect(flags).toContain('--suppress=palette-translated');
    expect(flags).toContain('--suppress=mdx-promotion');
  });

  it('emits --package-manager pnpm when non-default', () => {
    expect(answersToFlags({ ...baseline, packageManager: 'pnpm' })).toContain(
      '--package-manager=pnpm',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { answersToFlags } from './answers-to-flags.js';
import type { WizardAnswers } from '../../domain/wizard/answers.js';
import { parseArgs } from '../../interface/cli/parse-args.js';

const baseline: WizardAnswers = {
  projectDir: './project',
  outputDir: './output',
  packageManager: 'npm',
  check: false,
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

  it('does not emit --no-check when check is false (matches parser default)', () => {
    expect(answersToFlags({ ...baseline, check: false })).not.toContain('--no-check');
  });

  it('emits --check when check is true', () => {
    expect(answersToFlags({ ...baseline, check: true })).toContain('--check');
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

describe('answersToFlags ↔ parseArgs round-trip', () => {
  function answersFor(over: Partial<WizardAnswers> = {}): WizardAnswers {
    return { ...baseline, ...over };
  }

  it('round-trips a vanilla all-defaults answer set', () => {
    const a = answersFor();
    const parsed = parseArgs([...answersToFlags(a)]);
    expect(parsed.kind).toBe('convert');
    if (parsed.kind === 'convert') {
      expect(parsed.projectDir).toBe(a.projectDir);
      expect(parsed.outputDir).toBe(a.outputDir);
      expect(parsed.check).toBe(a.check);
      expect(parsed.tabs).toBe(null); // null because no override emitted
      expect(parsed.rss).toBe(null);
    }
  });

  it('round-trips check: true', () => {
    const a = answersFor({ check: true });
    const parsed = parseArgs([...answersToFlags(a)]);
    expect(parsed.kind).toBe('convert');
    if (parsed.kind === 'convert') expect(parsed.check).toBe(true);
  });

  it('round-trips an override-heavy answer set', () => {
    const a = answersFor({
      check: true,
      tabs: 'html',
      rss: false,
      packageManager: 'pnpm',
      linksValidator: false,
      configFormat: 'ts',
      packageName: 'my-pkg',
      mikeVersions: ['v1', 'v2'],
      suppressRules: ['mdx-promotion', 'palette-translated'],
    });
    const parsed = parseArgs([...answersToFlags(a)]);
    expect(parsed.kind).toBe('convert');
    if (parsed.kind === 'convert') {
      expect(parsed.tabs).toBe('html');
      expect(parsed.rss).toBe(false);
      expect(parsed.packageManager).toBe('pnpm');
      expect(parsed.linksValidator).toBe(false);
      expect(parsed.configFormat).toBe('ts');
      expect(parsed.packageName).toBe('my-pkg');
      expect(parsed.mikeVersions).toEqual(['v1', 'v2']);
      expect(parsed.suppressRules).toEqual(['mdx-promotion', 'palette-translated']);
    }
  });
});

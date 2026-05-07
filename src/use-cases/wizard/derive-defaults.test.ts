import { describe, expect, it } from 'vitest';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import { deriveDefaults, deriveOutputDirName, guessPackageManager } from './derive-defaults.js';

const baseConfig: MkdocsConfig = {
  siteName: 'My Docs',
  siteDescription: null,
  siteUrl: null,
  docsDir: 'docs',
  useDirectoryUrls: true,
  copyright: null,
  repoName: null,
  repoUrl: null,
  editUri: null,
  nav: null,
  theme: null,
  plugins: [],
  markdownExtensions: [],
  extras: {},
};

describe('deriveDefaults', () => {
  it("produces all defaults equal to today's converter behavior (no overrides)", () => {
    const d = deriveDefaults(baseConfig, { userAgent: undefined, env: {} });
    expect(d.packageManager).toBe('npm');
    expect(d.check).toBe(true);
    expect(d.tabs).toBe('mdx');
    expect(d.sidebarTopics).toBe(true);
    expect(d.rss).toBe(true);
    expect(d.mikeVersions).toEqual([]);
    expect(d.palette).toBe('translate');
    expect(d.extraAssets).toEqual([]);
    expect(d.locales).toEqual([]);
    expect(d.snippetBasePaths).toEqual([]);
    expect(d.snippetMaxDepth).toBe(8);
    expect(d.snippetDedentSubsections).toBe(false);
    expect(d.linksValidator).toBe(true);
    expect(d.expressiveCodeTheme).toBeNull();
    expect(d.cards).toBe('html');
    expect(d.mdxMode).toBe('auto');
    expect(d.logoReplacesTitle).toBe(false);
    expect(d.admonitionMapPath).toBeNull();
    expect(d.keepExplicitHeadingIds).toBe(false);
    expect(d.smartSymbols).toBe(true);
    expect(d.emojiShortcodes).toBe(true);
    expect(d.inlineMarks).toBe(true);
    expect(d.autoAppend).toBe(true);
    expect(d.suppressRules).toEqual([]);
    expect(d.configFormat).toBe('mjs');
    expect(d.packageName).toBeNull();
  });
});

describe('deriveOutputDirName', () => {
  // Default = `${cwd}/starlight`. The wizard runs in the user's shell — the
  // most discoverable answer is "a `starlight` folder right here, next to
  // wherever I invoked the CLI." Absolute path so the user sees, in the prompt
  // itself, exactly where the converted site will land.
  it('returns ${cwd}/starlight for a typical absolute cwd', () => {
    expect(deriveOutputDirName('/Users/me/projects/docs')).toBe(
      '/Users/me/projects/docs/starlight',
    );
  });

  it('joins safely when cwd has a trailing slash', () => {
    expect(deriveOutputDirName('/Users/me/projects/docs/')).toBe(
      '/Users/me/projects/docs/starlight',
    );
  });

  it('handles a relative cwd (test/CI scenarios)', () => {
    expect(deriveOutputDirName('.')).toBe('starlight');
  });
});

describe('guessPackageManager', () => {
  it('returns npm when npm_config_user_agent is missing', () => {
    expect(guessPackageManager(undefined)).toBe('npm');
  });

  it('detects pnpm', () => {
    expect(guessPackageManager('pnpm/8.6.0 npm/? node/v20.0.0 darwin x64')).toBe('pnpm');
  });

  it('detects yarn', () => {
    expect(guessPackageManager('yarn/3.6.0 npm/? node/v20.0.0 linux x64')).toBe('yarn');
  });

  it('detects bun', () => {
    expect(guessPackageManager('bun/1.0.0 npm/? node/v20.0.0 darwin arm64')).toBe('bun');
  });

  it('falls back to npm for unrecognized agents', () => {
    expect(guessPackageManager('something-weird/1.0')).toBe('npm');
  });
});

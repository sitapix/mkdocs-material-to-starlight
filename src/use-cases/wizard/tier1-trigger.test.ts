import { describe, expect, it } from 'vitest';
import { triggerSet, type Tier1Trigger } from './tier1-trigger.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';

function plan(over: Partial<MkdocsConfig> = {}): ConversionPlan {
  const config: MkdocsConfig = {
    siteName: 's',
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

describe('triggerSet', () => {
  it('fires nothing on a vanilla mkdocs site', () => {
    expect(triggerSet(plan())).toEqual([]);
  });

  it('fires "tabs" when content.tabs.link is in theme.features', () => {
    const p = plan({
      theme: { name: 'material', options: { features: ['content.tabs.link'] } },
    });
    expect(triggerSet(p)).toContain<Tier1Trigger>('tabs');
  });

  it('fires "sidebar-topics" when navigation.tabs is in theme.features', () => {
    const p = plan({
      theme: { name: 'material', options: { features: ['navigation.tabs'] } },
    });
    expect(triggerSet(p)).toContain<Tier1Trigger>('sidebar-topics');
  });

  it('fires "snippets" when pymdownx.snippets extension is configured', () => {
    const p = plan({
      markdownExtensions: [{ name: 'pymdownx.snippets', options: {} }],
    });
    expect(triggerSet(p)).toContain<Tier1Trigger>('snippets');
  });

  it('fires "rss" when rss plugin is present', () => {
    const p = plan({ plugins: [{ name: 'rss', options: {} }] });
    expect(triggerSet(p)).toContain<Tier1Trigger>('rss');
  });

  it('fires "i18n" when i18n plugin is present', () => {
    const p = plan({ plugins: [{ name: 'i18n', options: {} }] });
    expect(triggerSet(p)).toContain<Tier1Trigger>('i18n');
  });

  it('fires "mike" when mike plugin is present', () => {
    const p = plan({ plugins: [{ name: 'mike', options: {} }] });
    expect(triggerSet(p)).toContain<Tier1Trigger>('mike');
  });

  it('fires "palette" when theme.palette is set', () => {
    const p = plan({
      theme: { name: 'material', options: { palette: { primary: 'blue' } } },
    });
    expect(triggerSet(p)).toContain<Tier1Trigger>('palette');
  });

  it('fires "extra-assets" when extra_css or extra_javascript is non-empty', () => {
    const p = plan();
    const withCss = { ...p, detectedExtraCss: ['custom.css'] };
    expect(triggerSet(withCss)).toContain<Tier1Trigger>('extra-assets');
    const withJs = { ...p, detectedExtraJs: ['custom.js'] };
    expect(triggerSet(withJs)).toContain<Tier1Trigger>('extra-assets');
  });
});

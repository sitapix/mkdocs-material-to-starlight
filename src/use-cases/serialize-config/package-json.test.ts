import { describe, expect, it } from 'vitest';
import { serializePackageJson } from './package-json.js';

describe('serializePackageJson', () => {
  it('produces a buildable package.json for the generated Starlight project', () => {
    const out = serializePackageJson({
      siteName: 'My Docs',
      siteDescription: null,
    });
    const parsed = JSON.parse(out);
    expect(parsed.name).toBe('my-docs');
    expect(parsed.type).toBe('module');
    expect(parsed.dependencies).toMatchObject({
      astro: expect.any(String),
      '@astrojs/starlight': expect.any(String),
    });
    expect(parsed.scripts).toMatchObject({
      dev: 'astro dev',
      build: 'astro build',
      preview: 'astro preview',
    });
  });

  it('slugifies the site name into a package name (lowercase, kebab-case)', () => {
    expect(
      JSON.parse(serializePackageJson({ siteName: 'Hello World!', siteDescription: null })).name,
    ).toBe('hello-world');
    expect(
      JSON.parse(serializePackageJson({ siteName: '  My Docs  ', siteDescription: null })).name,
    ).toBe('my-docs');
  });

  it('preserves the description when present', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: 'A demo project.',
    });
    expect(JSON.parse(out).description).toBe('A demo project.');
  });

  it('omits description when not present', () => {
    const out = serializePackageJson({ siteName: 'X', siteDescription: null });
    expect(JSON.parse(out).description).toBeUndefined();
  });

  it('emits valid pretty-printed JSON ending with a newline', () => {
    const out = serializePackageJson({ siteName: 'X', siteDescription: null });
    expect(out.endsWith('\n')).toBe(true);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('falls back to a sensible name for empty or non-alpha titles', () => {
    expect(JSON.parse(serializePackageJson({ siteName: '!!!', siteDescription: null })).name).toBe(
      'starlight-docs',
    );
    expect(JSON.parse(serializePackageJson({ siteName: '', siteDescription: null })).name).toBe(
      'starlight-docs',
    );
  });

  it('adds math dependencies when math feature is detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['math'],
    });
    const parsed = JSON.parse(out);
    expect(parsed.dependencies).toHaveProperty('remark-math');
    expect(parsed.dependencies).toHaveProperty('rehype-katex');
    // `katex` is the source of `katex/dist/katex.min.css` that astro.config
    // wires into customCss. rehype-katex pulls it in transitively, but we
    // pin it explicitly so the import path resolves on a fresh install.
    expect(parsed.dependencies).toHaveProperty('katex');
  });

  it('adds astro-mermaid when mermaid feature is detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['mermaid'],
    });
    expect(JSON.parse(out).dependencies).toHaveProperty('astro-mermaid');
  });

  it('adds @astrojs/rss when rss feature is detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['rss'],
    });
    expect(JSON.parse(out).dependencies).toHaveProperty('@astrojs/rss');
  });

  it('does not add math or mermaid deps when those features are not detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: [],
    });
    const parsed = JSON.parse(out);
    expect(parsed.dependencies).not.toHaveProperty('remark-math');
    expect(parsed.dependencies).not.toHaveProperty('rehype-katex');
    expect(parsed.dependencies).not.toHaveProperty('astro-mermaid');
  });

  it('uses packageName directly when provided, bypassing slugification', () => {
    const out = serializePackageJson({
      siteName: 'My Docs Site',
      siteDescription: null,
      packageName: 'my-pkg',
    });
    expect(JSON.parse(out).name).toBe('my-pkg');
  });

  it('adds starlight-changelogs alongside starlight-versions when versions is detected (mike companion)', () => {
    // When the user runs `mike` for versioning, the natural companion is
    // `starlight-changelogs` so users can publish changelog entries between
    // versions. The gap-analysis report (2026-05-03) recommends bundling them.
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['versions'],
    });
    const parsed = JSON.parse(out);
    expect(parsed.dependencies).toHaveProperty('starlight-versions');
    expect(parsed.dependencies).toHaveProperty('starlight-changelogs');
  });

  it('adds starlight-kbd when kbd feature is detected (pymdownx.keys companion)', () => {
    // Tier-4 closure: pymdownx.keys (`++ctrl+alt+del++`) renders as inline
    // <kbd> HTML; starlight-kbd installs CSS that styles those tags with the
    // keyboard-key chrome users expect from Material.
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['kbd'],
    });
    expect(JSON.parse(out).dependencies).toHaveProperty('starlight-kbd');
  });

  it('does not add starlight-kbd when kbd is not detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: [],
    });
    expect(JSON.parse(out).dependencies).not.toHaveProperty('starlight-kbd');
  });

  it('adds starlight-announcement when announcement feature is detected (announce.dismiss companion)', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['announcement'],
    });
    expect(JSON.parse(out).dependencies).toHaveProperty('starlight-announcement');
  });

  it('adds starlight-page-actions when page-actions feature is detected (content.action.view companion)', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['page-actions'],
    });
    expect(JSON.parse(out).dependencies).toHaveProperty('starlight-page-actions');
  });

  it('adds starlight-github-alerts when github-alerts feature is detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: ['github-alerts'],
    });
    expect(JSON.parse(out).dependencies).toHaveProperty('starlight-github-alerts');
  });

  it('does not add starlight-github-alerts when github-alerts is not detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: [],
    });
    expect(JSON.parse(out).dependencies).not.toHaveProperty('starlight-github-alerts');
  });

  it('always includes starlight-llms-txt as a default dependency (AI-assistant accessibility)', () => {
    // Tier-3 closure: starlight-llms-txt generates llms.txt / llms-full.txt
    // automatically from Starlight content. It needs no per-site configuration
    // and improves AI-assistant accessibility for every Starlight site, so the
    // converter installs it by default.
    const outNoFeatures = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
    });
    expect(JSON.parse(outNoFeatures).dependencies).toHaveProperty('starlight-llms-txt');

    const outWithFeatures = serializePackageJson({
      siteName: 'Y',
      siteDescription: null,
      detectedFeatures: ['math', 'versions'],
    });
    expect(JSON.parse(outWithFeatures).dependencies).toHaveProperty('starlight-llms-txt');
  });

  it('does not add starlight-changelogs when versions is not detected', () => {
    const out = serializePackageJson({
      siteName: 'X',
      siteDescription: null,
      detectedFeatures: [],
    });
    expect(JSON.parse(out).dependencies).not.toHaveProperty('starlight-changelogs');
  });

  it('pins @astrojs/starlight to ^0.39.1 or newer (sidebar autogen items shape + 0.39.1 icons)', () => {
    // Starlight 0.39.0 (2026-05-07) made an autogenerated sidebar group's
    // `autogenerate` key REQUIRE wrapping in an `items` array — the
    // legacy `{ label, autogenerate }` shape is rejected at config-load.
    // Our serializer now emits the new shape, so a pin <0.39.0 produces
    // immediate build failures on a fresh install.
    //
    // Starlight 0.39.1 ships 13 new built-in icons (clock, padlock,
    // database, server, code-branch, question, question-circle, desktop,
    // mobile-android, solidjs, …) that the curated icon map now uses.
    // Pinning <0.39.1 means our icon shortcodes resolve to names that do
    // not exist in the installed Starlight, also a build failure.
    const out = serializePackageJson({ siteName: 'X', siteDescription: null });
    const version = JSON.parse(out).dependencies['@astrojs/starlight'];
    const match = version.match(/^\^?(\d+)\.(\d+)\.(\d+)/);
    expect(match).not.toBeNull();
    const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const meetsFloor =
      major > 0 || (major === 0 && minor > 39) || (major === 0 && minor === 39 && patch >= 1);
    expect(meetsFloor, `expected >=0.39.1, got ${version}`).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import { serializeAstroConfig } from './astro-config.js';

describe('serializeAstroConfig extraHeadEntries', () => {
  it('emits arbitrary head[] entries (script with content, link tags) alongside extraJsEntries', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      extraHeadEntries: [
        {
          tag: 'script',
          attrs: { async: true, src: 'https://example.com/x.js' },
        },
        {
          tag: 'script',
          content: "console.log('inline')",
        },
        {
          tag: 'link',
          attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        },
      ],
    });
    expect(out).toContain("src: 'https://example.com/x.js'");
    expect(out).toContain('content: "console.log(\'inline\')"');
    expect(out).toContain("tag: 'link'");
    expect(out).toContain("rel: 'preconnect'");
  });

  it('omits the head block when neither extraJsEntries nor extraHeadEntries are present', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('head:');
  });
});

describe('serializeAstroConfig expressiveCode', () => {
  it('emits an expressiveCode.themes pair when provided', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      expressiveCode: { themes: ['github-light', 'monokai'] },
    });
    expect(out).toContain(`expressiveCode: { themes: ['github-light', 'monokai'] }`);
  });

  it('omits expressiveCode entirely when not provided', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('expressiveCode');
  });
});

describe('serializeAstroConfig', () => {
  it('produces a complete astro.config.mjs file with site name and empty sidebar', () => {
    const out = serializeAstroConfig({
      siteName: 'My Docs',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain(`import { defineConfig } from 'astro/config';`);
    expect(out).toContain(`import starlight from '@astrojs/starlight';`);
    expect(out).toContain(`export default defineConfig`);
    expect(out).toContain(`title: 'My Docs'`);
    expect(out).toContain(`sidebar: []`);
  });

  it('includes site description when present', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: 'A demo.',
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain(`description: 'A demo.'`);
  });

  it('includes site URL when present (top-level Astro setting)', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: 'https://example.com/',
      sidebar: [],
    });
    expect(out).toContain(`site: 'https://example.com/'`);
  });

  it('embeds the serialized sidebar inline', () => {
    const sidebar: ReadonlyArray<SidebarEntry> = [
      { kind: 'slug', slug: '', label: 'Home' },
      { kind: 'group', label: 'API', items: [{ kind: 'slug', slug: 'api/auth' }] },
    ];
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar,
    });
    expect(out).toContain(`label: 'Home'`);
    expect(out).toContain(`label: 'API'`);
    expect(out).toContain(`'api/auth'`);
  });

  it('escapes single quotes in string values', () => {
    const out = serializeAstroConfig({
      siteName: "It's me",
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain(`title: 'It\\'s me'`);
  });

  it('escapes embedded newlines in string values (multi-line YAML scalars)', () => {
    // Real-world: dokka-material-mkdocs `mkdocs.yml` declares
    //   site_description: |
    //     Embed your Kotlin documentation comments into a Material…
    // The trailing `\n` from the block scalar would otherwise emit a raw
    // newline inside the single-quoted JS string and crash the Astro
    // config loader with "invalid JS syntax".
    const out = serializeAstroConfig({
      siteName: 'Site',
      siteDescription: 'Line one\nLine two\n',
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain(`description: 'Line one\\nLine two\\n'`);
    // The output must not contain a literal newline inside the description
    // string — verify by reconstructing the description line and asserting
    // it stays on one line.
    const descLine = out.split('\n').find((l) => l.trim().startsWith('description:'));
    expect(descLine).toBeDefined();
    expect(descLine).not.toMatch(/\n/);
  });

  it('skips `site:` when siteUrl is not a parseable absolute URL', () => {
    // Real-world: governance/src/mkdocs.yml writes
    //   site_url: !!python/object/apply:os.getenv ["PUBLIC_URL"]
    // The YAML tolerant-tag handler decodes the Python tag to the marker
    // string `/apply:os.getenv` — not a URL. Emitting `site: '/apply:os.getenv'`
    // crashes Astro at config-load with "Invalid URL". Skip the field
    // entirely; Astro tolerates a missing site.
    const out = serializeAstroConfig({
      siteName: 'Site',
      siteDescription: null,
      siteUrl: '/apply:os.getenv',
      sidebar: [],
    });
    expect(out).not.toMatch(/^\s*site:\s/m);
  });

  it('emits `site:` when siteUrl is a real https URL', () => {
    const out = serializeAstroConfig({
      siteName: 'Site',
      siteDescription: null,
      siteUrl: 'https://example.com/',
      sidebar: [],
    });
    expect(out).toContain(`site: 'https://example.com/'`);
  });

  it('escapes carriage returns and tabs in string values', () => {
    const out = serializeAstroConfig({
      siteName: 'Site\twith\ttabs',
      siteDescription: 'Line\rwith\rCR',
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain(`'Site\\twith\\ttabs'`);
    expect(out).toContain(`'Line\\rwith\\rCR'`);
  });

  it('produces output that mentions the integrations array', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).toContain('integrations:');
    expect(out).toContain('starlight(');
  });

  it('imports remark-math and rehype-katex when math feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['math'],
    });
    expect(out).toContain(`import remarkMath from 'remark-math';`);
    expect(out).toContain(`import rehypeKatex from 'rehype-katex';`);
    expect(out).toContain('remarkPlugins:');
    expect(out).toContain('remarkMath');
    expect(out).toContain('rehypePlugins:');
    expect(out).toContain('rehypeKatex');
  });

  it('auto-registers katex/dist/katex.min.css when math feature is detected', () => {
    // Without this, formulas render as raw LaTeX text. We auto-add the CSS
    // to Starlight's customCss so users have zero manual steps for math.
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['math'],
    });
    expect(out).toContain(`'katex/dist/katex.min.css'`);
  });

  it('does NOT register katex CSS when math is not detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: [],
    });
    expect(out).not.toContain('katex');
  });

  it('imports astro-mermaid when mermaid feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['mermaid'],
    });
    expect(out).toContain(`import mermaid from 'astro-mermaid';`);
    expect(out).toContain('mermaid()');
  });

  it('imports starlight-image-zoom as a Starlight plugin when image-zoom is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['image-zoom'],
    });
    expect(out).toContain(`import imageZoom from 'starlight-image-zoom';`);
    expect(out).toContain('plugins: [');
    expect(out).toContain('imageZoom()');
  });

  it('imports starlight-versions as a Starlight plugin when versions is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['versions'],
    });
    expect(out).toContain(`import starlightVersions from 'starlight-versions';`);
    expect(out).toContain('starlightVersions(');
  });

  it('imports and wires starlight-announcement when announcement feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['announcement'],
    });
    expect(out).toContain(`import starlightAnnouncement from 'starlight-announcement';`);
    expect(out).toContain('starlightAnnouncement(');
  });

  it('imports and wires starlight-page-actions when page-actions feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['page-actions'],
    });
    expect(out).toContain(`import starlightPageActions from 'starlight-page-actions';`);
    expect(out).toContain('starlightPageActions()');
  });

  it('imports and wires starlight-github-alerts when github-alerts feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['github-alerts'],
    });
    expect(out).toContain(`import starlightGithubAlerts from 'starlight-github-alerts';`);
    expect(out).toContain('starlightGithubAlerts()');
  });

  it('imports and wires starlight-kbd when kbd feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['kbd'],
    });
    expect(out).toContain(`import starlightKbd from 'starlight-kbd';`);
    // starlight-kbd 0.4.0+ requires a `types` array; the converter emits a
    // single default type the user can extend.
    expect(out).toContain('starlightKbd({');
    expect(out).toContain('types:');
    expect(out).toContain("id: 'default'");
  });

  it('imports and wires starlight-llms-txt when site URL is declared', () => {
    // starlight-llms-txt requires `site:` in astro.config.mjs (it builds
    // absolute URLs into the emitted llms.txt index). Wire it only when
    // `siteUrl` is non-null — otherwise the plugin throws on `astro dev`.
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: 'https://example.com',
      sidebar: [],
    });
    expect(out).toContain(`import starlightLlmsTxt from 'starlight-llms-txt';`);
    expect(out).toContain('starlightLlmsTxt()');
  });

  it('skips starlight-llms-txt when site URL is null (mkdocs.yml had no site_url)', () => {
    // Real-world case: GMS² and other Material sites omit `site_url`.
    // Without `site:` in astro.config.mjs, starlight-llms-txt throws at
    // dev/build time. Skip the plugin in that case so the build is clean.
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('starlight-llms-txt');
    expect(out).not.toContain('starlightLlmsTxt');
  });

  it('imports starlight-blog when the blog feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['blog'],
    });
    expect(out).toContain(`import starlightBlog from 'starlight-blog';`);
    expect(out).toContain('starlightBlog()');
  });

  it('imports starlight-tags when the tags feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['tags'],
    });
    expect(out).toContain(`import starlightTags from 'starlight-tags';`);
    expect(out).toContain('starlightTags()');
  });

  it('emits a redirects: block when redirects are passed', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      redirects: { '/old/page': '/new/page', '/gone': 'https://elsewhere.example' },
    });
    expect(out).toContain('redirects: {');
    expect(out).toContain(`'/old/page': '/new/page',`);
    expect(out).toContain(`'/gone': 'https://elsewhere.example',`);
  });

  it('omits the redirects: block when no redirects are present', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('redirects:');
  });

  it('emits lastUpdated: true when the last-updated feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['last-updated'],
    });
    expect(out).toContain('lastUpdated: true');
  });

  it('emits the contributor-list import + integration with placeholder list when feature is detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['contributor-list'],
    });
    expect(out).toContain("import starlightContributorList from 'starlight-contributor-list';");
    expect(out).toContain('starlightContributorList({ list: [] })');
    // TODO comment must precede the call so users see it in the diff.
    expect(out).toMatch(/TODO[^\n]*contributors[\s\S]*starlightContributorList/);
  });

  it('does NOT emit the contributor-list integration when the feature is absent', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('starlight-contributor-list');
    expect(out).not.toContain('starlightContributorList');
  });

  it('emits defaultLocale and locales when i18n config is provided', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      i18n: {
        defaultLocale: 'en',
        locales: [
          { code: 'en', label: 'English', isDefault: true },
          { code: 'fr', label: 'Français', isDefault: false },
        ],
      },
    });
    // Starlight requires `defaultLocale` to match a key in the `locales`
    // map. Since we always use `root` as the key for the default locale,
    // `defaultLocale` is always literally 'root'.
    expect(out).toContain(`defaultLocale: 'root'`);
    expect(out).toContain('locales: {');
    // Default locale gets the `root` key.
    expect(out).toContain(`root: { label: 'English', lang: 'en' }`);
    // Non-default locales use their code as the key.
    expect(out).toContain(`fr: { label: 'Français', lang: 'fr' }`);
  });

  it('quotes regional locale keys (zh-CN) which are not bare identifiers', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      i18n: {
        defaultLocale: 'en',
        locales: [
          { code: 'en', label: 'English', isDefault: true },
          { code: 'zh-CN', label: '简体中文', isDefault: false },
        ],
      },
    });
    expect(out).toContain(`'zh-CN': { label: '简体中文', lang: 'zh-CN' }`);
  });

  it('omits the i18n block when no i18n config is provided', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('defaultLocale:');
    expect(out).not.toContain('locales: {');
  });

  it('does not import math or mermaid plugins when not detected', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: [],
    });
    expect(out).not.toContain('remark-math');
    expect(out).not.toContain('rehype-katex');
    expect(out).not.toContain('astro-mermaid');
  });
});

describe('serializeAstroConfig enableLinksValidator', () => {
  it('omits starlight-links-validator import when enableLinksValidator is false', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      enableLinksValidator: false,
    });
    expect(out).not.toContain('starlight-links-validator');
    expect(out).not.toContain('starlightLinksValidator');
  });

  it('includes starlight-links-validator import when enableLinksValidator is true', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      enableLinksValidator: true,
    });
    expect(out).toContain(`import starlightLinksValidator from 'starlight-links-validator';`);
    expect(out).toContain('starlightLinksValidator({');
  });
});

describe('serializeAstroConfig logoReplacesTitle', () => {
  it('emits replacesTitle: true when logoReplacesTitle option is set and logo is present', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      logo: { src: './src/assets/logo.png', replacesTitle: true },
    });
    expect(out).toContain('replacesTitle: true');
  });

  it('does not emit replacesTitle when logo is present without the option', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      logo: { src: './src/assets/logo.png' },
    });
    expect(out).not.toContain('replacesTitle');
  });
});

describe('serializeAstroConfig mikeVersions', () => {
  it('emits the provided versions list replacing the placeholder', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['versions'],
      mikeVersions: ['1.0', '2.0', '3.0'],
    });
    expect(out).toContain("{ slug: '1.0' }");
    expect(out).toContain("{ slug: '2.0' }");
    expect(out).toContain("{ slug: '3.0' }");
    expect(out).not.toContain("{ slug: '2.0' }," + '\n' + "          { slug: '3.0' }");
  });

  it('emits an empty versions array when mikeVersions is an empty array', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['versions'],
      mikeVersions: [],
    });
    expect(out).toContain('starlightVersions({ versions: [] })');
  });

  it('emits a commented-out invocation (not an active placeholder) when mikeVersions is not provided', () => {
    // Real-world (xyngular/py-xboto): the source mkdocs.yml declared
    // `extra.version.provider: mike` with no concrete `versions:` array
    // (mike reads them from git tags at build time). The previous behavior
    // emitted `starlightVersions({ versions: [{ slug: '2.0' }] })` as a
    // placeholder, which the plugin then rejected at `astro:config:setup`
    // because the placeholder slug had no corresponding docs/2.0/ tree —
    // breaking the entire build. Better to emit a guidance comment so the
    // site still builds and the user knows to fill in real version slugs.
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
      detectedFeatures: ['versions'],
    });
    // No active plugin invocation — the placeholder used to read like:
    //   starlightVersions({ versions: [{ slug: '2.0' }] }),
    expect(out).not.toMatch(/^\s*starlightVersions\(\{ versions: /m);
    // Guidance comment present.
    expect(out).toContain('// TODO: starlightVersions');
  });
});

describe('serializeAstroConfig useDirectoryUrls', () => {
  it('emits build: { format: "file" } when useDirectoryUrls is false', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      useDirectoryUrls: false,
      sidebar: [],
    });
    expect(out).toContain("build: { format: 'file' }");
  });

  it('does NOT emit a build entry when useDirectoryUrls is true (matches Astro default)', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      useDirectoryUrls: true,
      sidebar: [],
    });
    expect(out).not.toContain('build:');
  });

  it('does NOT emit a build entry when useDirectoryUrls is omitted (defaults to MkDocs default)', () => {
    const out = serializeAstroConfig({
      siteName: 'X',
      siteDescription: null,
      siteUrl: null,
      sidebar: [],
    });
    expect(out).not.toContain('build:');
  });
});

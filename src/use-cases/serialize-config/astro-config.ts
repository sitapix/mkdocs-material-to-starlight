/**
 * Serialize a Starlight project's `astro.config.mjs` from typed inputs.
 *
 * Pure: takes the migrated configuration shape (site name, optional URL and
 * description, sidebar tree) and returns the JS source for the file. The
 * interface layer writes the result to disk.
 *
 * The output is intentionally minimal — it reflects what the migration tool
 * derived from `mkdocs.yml`. Users add custom integrations, plugins, or
 * additional Starlight options after migration; this file is meant to compile
 * cleanly on day one, not to be the final config.
 */

import type { SidebarEntry } from '../../domain/starlight/sidebar.js';
import { translateBlogOptions } from './blog-options.js';
import type { DetectedFeature } from './package-json.js';
import { serializeSidebar } from './sidebar.js';
import { translateTagsOptions } from './tags-options.js';

export interface AstroConfigInput {
  readonly siteName: string;
  readonly siteDescription: string | null;
  readonly siteUrl: string | null;
  /**
   * MkDocs `use_directory_urls` setting. When false, the source site uses
   * flat `/page.html` URLs; emit `build: { format: 'file' }` so Astro
   * mirrors that shape. Astro's default (`directory`) matches the MkDocs
   * default (`true`), so no entry is emitted in that case.
   */
  readonly useDirectoryUrls?: boolean;
  readonly sidebar: ReadonlyArray<SidebarEntry>;
  readonly detectedFeatures?: ReadonlyArray<DetectedFeature>;
  /** Slug-to-slug redirect map extracted from the `mkdocs-redirects` plugin. */
  readonly redirects?: Readonly<Record<string, string>>;
  /** Structured i18n config from `mkdocs-static-i18n`. When present, emits
   *  `defaultLocale` + `locales: { … }` in starlight() options. */
  readonly i18n?: {
    readonly defaultLocale: string;
    readonly locales: ReadonlyArray<{
      readonly code: string;
      readonly label: string;
      readonly isDefault: boolean;
    }>;
  };
  /** Social links from Material's `extra.social[]`, mapped to Starlight icons. */
  readonly social?: ReadonlyArray<{
    readonly icon: string;
    readonly label: string;
    readonly href: string;
  }>;
  /** Edit-link base URL, derived from `repo_url` + `edit_uri`. */
  readonly editLinkBaseUrl?: string;
  /** Logo path under src/assets, optional. */
  readonly logo?: { readonly src: string; readonly replacesTitle?: boolean };
  /** Favicon path (relative to project root, served from /). */
  readonly favicon?: string;
  /** Table of contents config: `false` to disable, or `{ min, max }`. */
  readonly tableOfContents?:
    | false
    | { readonly minHeadingLevel: number; readonly maxHeadingLevel: number };
  /** When true, register starlight-links-validator plugin. */
  readonly enableLinksValidator?: boolean;
  /** Additional CSS files to register via Starlight's customCss. */
  readonly extraCssEntries?: ReadonlyArray<string>;
  /** Additional <script> tags injected via Starlight's head[]. */
  readonly extraJsEntries?: ReadonlyArray<{
    readonly src: string;
    readonly type?: 'module';
    readonly async?: boolean;
    readonly defer?: boolean;
  }>;
  /** ExpressiveCode theme pair derived from `pymdownx.highlight.pygments_style`.
   *  Both light and dark themes are required for Starlight's theme switcher. */
  readonly expressiveCode?: { readonly themes: readonly [string, string] };
  /** Version slugs for the `starlight-versions` plugin. When provided,
   *  replaces the hardcoded `[{ slug: '2.0' }]` placeholder. When provided
   *  as an empty array, emits `versions: []`. When omitted, uses the
   *  placeholder. */
  readonly mikeVersions?: ReadonlyArray<string>;
  /** Arbitrary entries to inject into Starlight's head[] config. Generalizes
   *  `extraJsEntries`: each entry can be a `<script>` (with src or inline
   *  content), a `<link>`, or a `<meta>` tag. Used today for analytics
   *  injection from `extra.analytics`. */
  readonly extraHeadEntries?: ReadonlyArray<{
    readonly tag: 'script' | 'link' | 'meta';
    readonly attrs?: Readonly<Record<string, string | boolean | number>>;
    readonly content?: string;
  }>;
  /** Raw `plugins.blog` options from mkdocs.yml. When present, the converter
   *  translates a curated subset to `starlightBlog({...})` config (see
   *  `blog-options.ts`). Unrecognized keys are dropped; users hand-port
   *  via the `plugin-blog-custom-config` diagnostic. */
  readonly blogOptions?: Readonly<Record<string, unknown>>;
  /** Raw `plugins.tags` options from mkdocs.yml. Translated to
   *  `starlightTags({...})` config (see `tags-options.ts`). */
  readonly tagsOptions?: Readonly<Record<string, unknown>>;
  /** Giscus config parsed from the Material comments override partial.
   *  Present iff the `giscus` feature is detected — starlight-giscus
   *  hard-requires all four fields. */
  readonly giscus?: {
    readonly repo: string;
    readonly repoId: string;
    readonly category: string;
    readonly categoryId: string;
  };
  /** Subpath from `site_url` (e.g. `/repo` for GitHub Pages project
   *  sites). When set, `site:` is emitted origin-only, `base:` carries the
   *  path, and starlight-base-path rewrites content links (gated on the
   *  `base-path` feature). */
  readonly basePath?: string;
  /** Slugs of converted pages no topic claims (not in the nav). Emitted
   *  into starlight-sidebar-topics' `exclude` — the plugin hard-errors on
   *  any page it cannot associate with a topic. */
  readonly topicExcludeSlugs?: ReadonlyArray<string>;
}

export function serializeAstroConfig(input: AstroConfigInput): string {
  const features = new Set(input.detectedFeatures ?? []);
  const hasMath = features.has('math');
  const hasMermaid = features.has('mermaid');
  const hasImageZoom = features.has('image-zoom');
  const hasVersions = features.has('versions');
  const hasBlog = features.has('blog');
  const hasTags = features.has('tags');
  const hasLastUpdated = features.has('last-updated');
  const hasKbd = features.has('kbd');
  const hasGithubAlerts = features.has('github-alerts');
  const hasAnnouncement = features.has('announcement');
  const hasPageActions = features.has('page-actions');
  const hasHeadingBadges = features.has('heading-badges');
  const hasContributorList = features.has('contributor-list');
  const hasSidebarTopics = features.has('sidebar-topics');
  const hasScrollToTop = features.has('scroll-to-top');
  const hasGiscus = features.has('giscus') && input.giscus !== undefined;
  const hasMarkdownBlocks = features.has('markdown-blocks');
  const hasD2 = features.has('d2');
  const hasBasePath = features.has('base-path') && input.basePath !== undefined;

  // `starlight-llms-txt` requires `site:` in astro.config.mjs (it builds
  // absolute URLs into the emitted llms.txt index). When the source
  // mkdocs.yml has no `site_url`, we have nothing to feed it — installing
  // the plugin in that case is a hard failure at `astro dev` / `astro build`
  // time. Gate the import + invocation on `siteUrl` so projects without a
  // declared site URL still convert and build cleanly.
  //
  // Real-world (governance/src/mkdocs.yml): `site_url` was set to a Python
  // YAML tag that decodes to a marker string like `/apply:os.getenv`. That
  // is truthy but is NOT a parseable URL. We skip emitting `site:` in that
  // case (see the `site:` block below), and llms-txt depends on a real
  // `site:` field — so the same validity check gates the plugin.
  const enableLlmsTxt = input.siteUrl !== null && isValidAbsoluteUrl(input.siteUrl);

  const imports: string[] = [
    `import { defineConfig } from 'astro/config';`,
    `import starlight from '@astrojs/starlight';`,
  ];
  if (enableLlmsTxt) {
    // Default-on AI-assistant accessibility plugin — emits llms.txt routes
    // from Starlight content. Gap-analysis (2026-05-03) bundles this for
    // every emitted Starlight project that has a declared site URL.
    imports.push(`import starlightLlmsTxt from 'starlight-llms-txt';`);
  }
  if (hasSidebarTopics) {
    imports.push(`import starlightSidebarTopics from 'starlight-sidebar-topics';`);
  }
  if (hasScrollToTop) {
    imports.push(`import starlightScrollToTop from 'starlight-scroll-to-top';`);
  }
  if (hasGiscus) {
    imports.push(`import starlightGiscus from 'starlight-giscus';`);
  }
  if (hasMarkdownBlocks) {
    imports.push(`import starlightMarkdownBlocks, { Aside } from 'starlight-markdown-blocks';`);
  }
  if (hasBasePath) {
    // Named export — the package has no default (unlike its siblings).
    imports.push(`import { starlightBasePath } from 'starlight-base-path';`);
  }
  if (hasD2) {
    imports.push(`import d2 from 'astro-d2';`);
  }
  if (hasMermaid) {
    imports.push(`import mermaid from 'astro-mermaid';`);
  }
  if (hasImageZoom) {
    imports.push(`import imageZoom from 'starlight-image-zoom';`);
  }
  if (hasVersions) {
    // When `mikeVersions` is undefined, the plugin invocation is emitted as
    // a TODO comment (see hasVersions block below). Match the import side
    // so we don't ship a side-effecting import for an inactive plugin.
    if (input.mikeVersions === undefined) {
      imports.push(`// TODO: import starlightVersions from 'starlight-versions';`);
    } else {
      imports.push(`import starlightVersions from 'starlight-versions';`);
    }
  }
  if (hasBlog) {
    imports.push(`import starlightBlog from 'starlight-blog';`);
  }
  if (hasTags) {
    imports.push(`import starlightTags from 'starlight-tags';`);
  }
  if (hasKbd) {
    imports.push(`import starlightKbd from 'starlight-kbd';`);
  }
  if (hasGithubAlerts) {
    imports.push(`import starlightGithubAlerts from 'starlight-github-alerts';`);
  }
  if (hasAnnouncement) {
    imports.push(`import starlightAnnouncement from 'starlight-announcement';`);
  }
  if (hasPageActions) {
    imports.push(`import starlightPageActions from 'starlight-page-actions';`);
  }
  if (hasHeadingBadges) {
    imports.push(`import starlightHeadingBadges from 'starlight-heading-badges';`);
  }
  if (hasContributorList) {
    imports.push(`import starlightContributorList from 'starlight-contributor-list';`);
  }
  if (hasMath) {
    // Astro 7 made Sätteri the default Markdown processor; remark/rehype
    // plugins are only honored through an explicit unified processor from
    // `@astrojs/markdown-remark` (pinned in `versions.ts` for the math
    // feature). Without it, remark-math/rehype-katex silently never run
    // and formulas render as raw LaTeX text.
    imports.push(`import { unified } from '@astrojs/markdown-remark';`);
    imports.push(`import remarkMath from 'remark-math';`);
    imports.push(`import rehypeKatex from 'rehype-katex';`);
  }
  if (input.enableLinksValidator === true) {
    imports.push(`import starlightLinksValidator from 'starlight-links-validator';`);
  }

  const lines: string[] = [imports.join('\n'), '', 'export default defineConfig({'];

  // Astro's `site:` field is run through `new URL(value)` at config-load
  // time and rejects anything that isn't a parseable absolute URL. Real-
  // world break (governance/src/mkdocs.yml): the source uses
  //   `site_url: !!python/object/apply:os.getenv ["PUBLIC_URL"]`
  // to read the URL from an env var. The YAML loader's tolerant Python
  // tag handler decodes that to the marker string `/apply:os.getenv`,
  // which would propagate to `site: '/apply:os.getenv'` and crash the
  // dev server with "Invalid URL". Skip the field when the value isn't
  // a valid absolute URL — Astro defaults to no canonical and the user
  // can re-add it manually.
  if (input.siteUrl !== null && isValidAbsoluteUrl(input.siteUrl)) {
    if (hasBasePath && input.basePath !== undefined) {
      // GitHub Pages project-site shape (Astro's documented pattern):
      // `site` carries the origin, `base` carries the subpath. Starlight
      // prefixes its own routes with `base`; starlight-base-path (in
      // plugins below) prefixes links written in content.
      lines.push(`  site: ${quote(new URL(input.siteUrl).origin)},`);
      lines.push(`  base: ${quote(input.basePath)},`);
    } else {
      lines.push(`  site: ${quote(input.siteUrl)},`);
    }
  }
  if (input.useDirectoryUrls === false) {
    // Mirror MkDocs `use_directory_urls: false` so flat `/page.html` URLs
    // continue to work after migration. Astro's default is `directory`,
    // which matches MkDocs' default — emit only when the user opted out.
    lines.push("  build: { format: 'file' },");
  }

  const redirects = input.redirects ?? {};
  const redirectKeys = Object.keys(redirects).sort();
  if (redirectKeys.length > 0) {
    lines.push('  redirects: {');
    for (const from of redirectKeys) {
      lines.push(`    ${quote(from)}: ${quote(redirects[from] ?? '')},`);
    }
    lines.push('  },');
  }

  lines.push('  integrations: [');
  lines.push('    starlight({');
  lines.push(`      title: ${quote(input.siteName)},`);
  if (input.siteDescription !== null) {
    lines.push(`      description: ${quote(input.siteDescription)},`);
  }
  if (input.logo !== undefined) {
    if (input.logo.replacesTitle === true) {
      lines.push(`      logo: { src: ${quote(input.logo.src)}, replacesTitle: true },`);
    } else {
      lines.push(`      logo: { src: ${quote(input.logo.src)} },`);
    }
  }
  if (input.favicon !== undefined) {
    lines.push(`      favicon: ${quote(input.favicon)},`);
  }
  if (input.editLinkBaseUrl !== undefined) {
    lines.push(`      editLink: { baseUrl: ${quote(input.editLinkBaseUrl)} },`);
  }
  if (input.tableOfContents === false) {
    lines.push('      tableOfContents: false,');
  } else if (input.tableOfContents !== undefined) {
    lines.push(
      `      tableOfContents: { minHeadingLevel: ${String(input.tableOfContents.minHeadingLevel)}, maxHeadingLevel: ${String(input.tableOfContents.maxHeadingLevel)} },`,
    );
  }
  if (!hasSidebarTopics) {
    lines.push(`      sidebar: ${indentSidebar(serializeSidebar(input.sidebar))},`);
  }
  const cssEntries = ['./src/styles/mkdocs-migration.css'];
  // KaTeX ships its own stylesheet; rehype-katex emits the right markup but
  // produces unstyled glyphs without it. Auto-register so users get rendered
  // formulas without any manual CSS step.
  if (hasMath) cssEntries.push('katex/dist/katex.min.css');
  // Starlight's `customCss` is resolved as a Vite import — it accepts npm
  // package paths and relative file paths only. External URLs crash Astro
  // build with "Only URLs with a scheme in: file and data are supported".
  // Real-world: Enveloppe/mkdocs-publisher-template registers FontAwesome
  // and Obsidian-Publisher CSS via `https://cdn…`. Move external URLs
  // out of customCss into `<link>` tags in `head:` so they still load.
  const externalCssUrls: string[] = [];
  for (const e of input.extraCssEntries ?? []) {
    if (/^https?:\/\//i.test(e)) externalCssUrls.push(e);
    else cssEntries.push(e);
  }
  lines.push(`      customCss: [${cssEntries.map(quote).join(', ')}],`);
  const extraJs = input.extraJsEntries ?? [];
  const extraHead = input.extraHeadEntries ?? [];
  if (extraJs.length > 0 || extraHead.length > 0 || externalCssUrls.length > 0) {
    lines.push('      head: [');
    for (const href of externalCssUrls) {
      lines.push(`        { tag: 'link', attrs: { rel: 'stylesheet', href: ${quote(href)} } },`);
    }
    for (const js of extraJs) {
      const attrs: string[] = [`src: ${quote(js.src)}`];
      if (js.type !== undefined) attrs.push(`type: ${quote(js.type)}`);
      if (js.async === true) attrs.push('async: true');
      if (js.defer === true) attrs.push('defer: true');
      lines.push(`        { tag: 'script', attrs: { ${attrs.join(', ')} } },`);
    }
    for (const entry of extraHead) {
      const parts: string[] = [`tag: ${quote(entry.tag)}`];
      if (entry.attrs !== undefined && Object.keys(entry.attrs).length > 0) {
        const attrParts: string[] = [];
        for (const [k, v] of Object.entries(entry.attrs)) {
          if (typeof v === 'string') attrParts.push(`${quoteKey(k)}: ${quote(v)}`);
          else if (typeof v === 'number') attrParts.push(`${quoteKey(k)}: ${String(v)}`);
          else attrParts.push(`${quoteKey(k)}: ${v ? 'true' : 'false'}`);
        }
        parts.push(`attrs: { ${attrParts.join(', ')} }`);
      }
      if (entry.content !== undefined) {
        parts.push(`content: ${quoteDouble(entry.content)}`);
      }
      lines.push(`        { ${parts.join(', ')} },`);
    }
    lines.push('      ],');
  }
  if (hasLastUpdated) {
    lines.push('      lastUpdated: true,');
  }
  if (input.expressiveCode !== undefined) {
    const [light, dark] = input.expressiveCode.themes;
    lines.push(`      expressiveCode: { themes: [${quote(light)}, ${quote(dark)}] },`);
  }
  if (input.social !== undefined && input.social.length > 0) {
    lines.push('      social: [');
    for (const s of input.social) {
      lines.push(
        `        { icon: ${quote(s.icon)}, label: ${quote(s.label)}, href: ${quote(s.href)} },`,
      );
    }
    lines.push('      ],');
  }
  if (input.i18n !== undefined && input.i18n.locales.length > 0) {
    // Starlight requires `defaultLocale` to match a KEY in the `locales`
    // map. The default locale's key is always `root` (Starlight's
    // convention for the unprefixed locale directory). Real-world break
    // (ai-shifu, ultrabug): emitting `defaultLocale: 'en'` while the
    // map key is `root` crashed config-setup with "Could not determine
    // the default locale. Please make sure defaultLocale is one of
    // root, …".
    lines.push(`      defaultLocale: 'root',`);
    lines.push('      locales: {');
    for (const entry of input.i18n.locales) {
      const key = entry.isDefault ? 'root' : entry.code;
      lines.push(
        `        ${quoteKey(key)}: { label: ${quote(entry.label)}, lang: ${quote(entry.code)} },`,
      );
    }
    lines.push('      },');
  }
  const enableLinksValidator = input.enableLinksValidator === true;
  lines.push('      plugins: [');
  if (hasSidebarTopics) {
    // Material `navigation.tabs`: top-level nav sections become topics,
    // each with its own sidebar. The plugin OWNS sidebar generation, so
    // the `sidebar:` key is omitted above when this is active.
    //
    // `exclude` lists pages that legitimately belong to NO topic — the
    // plugin hard-errors on any unmatched page otherwise. The scaffolded
    // 404 is always topic-less; blog routes (posts plus starlight-blog's
    // generated authors/tags/archive pages) carry starlight-blog's own
    // sidebar instead of a topic.
    // '/' is always excluded: topic membership works through slug items,
    // and the root page's slug ('') cannot be referenced in a sidebar —
    // so the root can never be claimed by a topic and would hard-error.
    const excludeGlobs = ['/', '/404'];
    if (hasBlog) {
      const blogDir =
        typeof input.blogOptions?.blog_dir === 'string' ? input.blogOptions.blog_dir : 'blog';
      excludeGlobs.push(`/${blogDir}/**`);
    }
    // Converted pages absent from the nav (MkDocs converts every file,
    // listed or not) — computed exactly by the caller from the slug map.
    for (const slug of input.topicExcludeSlugs ?? []) {
      excludeGlobs.push(`/${slug}`);
    }
    lines.push(`        ${indentTopics(serializeSidebarTopics(input.sidebar, excludeGlobs))},`);
  }
  if (enableLlmsTxt) {
    lines.push('        starlightLlmsTxt(),');
  }
  if (hasBasePath) {
    // Reads `base` from the Astro config above and prefixes content links.
    lines.push('        starlightBasePath(),');
  }
  if (hasScrollToTop) {
    lines.push('        starlightScrollToTop(),');
  }
  if (hasGiscus && input.giscus !== undefined) {
    const g = input.giscus;
    lines.push(
      `        starlightGiscus({ repo: ${quote(g.repo)}, repoId: ${quote(g.repoId)}, category: ${quote(g.category)}, categoryId: ${quote(g.categoryId)} }),`,
    );
  }
  if (hasMarkdownBlocks) {
    // Material admonition types Starlight's four asides cannot express.
    // The converter emits `:::abstract` etc. verbatim (instead of
    // squashing to note/tip) whenever this plugin is installed; colors
    // approximate Material's admonition palette within the plugin's
    // blue/purple/red/orange/green/accent set.
    lines.push('        starlightMarkdownBlocks({');
    lines.push('          blocks: {');
    lines.push("            abstract: Aside({ label: 'Abstract', color: 'blue', icon: '📋' }),");
    lines.push("            info: Aside({ label: 'Info', color: 'blue', icon: 'ℹ️' }),");
    lines.push("            question: Aside({ label: 'Question', color: 'green', icon: '❓' }),");
    lines.push("            success: Aside({ label: 'Success', color: 'green', icon: '✅' }),");
    lines.push("            failure: Aside({ label: 'Failure', color: 'red', icon: '❌' }),");
    lines.push("            bug: Aside({ label: 'Bug', color: 'red', icon: '🐛' }),");
    lines.push("            example: Aside({ label: 'Example', color: 'purple', icon: '🧪' }),");
    lines.push('          },');
    lines.push('        }),');
  }
  if (hasImageZoom) {
    lines.push('        imageZoom(),');
  }
  if (hasVersions) {
    const versionSlugs = input.mikeVersions;
    if (versionSlugs === undefined) {
      // No concrete versions known: mkdocs.yml only declared
      // `extra.version.provider: mike` (mike reads versions from git tags
      // at build time, which the converter cannot reproduce). Emit a
      // guidance comment so the site still builds — an active
      // `starlightVersions({ versions: [{ slug: '2.0' }] })` placeholder
      // breaks `astro:config:setup` because the slug has no matching
      // docs/<version>/ tree. Re-run with `--mike-versions <slug>`
      // (repeatable) to enable the plugin.
      lines.push(
        "        // TODO: starlightVersions({ versions: [{ slug: '1.0' }] }) — fill in real version slugs and uncomment.",
      );
    } else if (versionSlugs.length === 0) {
      lines.push('        starlightVersions({ versions: [] }),');
    } else {
      const vList = versionSlugs.map((s) => `{ slug: ${quote(s)} }`).join(', ');
      lines.push(`        starlightVersions({ versions: [${vList}] }),`);
    }
  }
  if (hasBlog) {
    const blogArg = input.blogOptions !== undefined ? translateBlogOptions(input.blogOptions) : '';
    lines.push(`        starlightBlog(${blogArg}),`);
  }
  if (hasTags) {
    const tagsArg = input.tagsOptions !== undefined ? translateTagsOptions(input.tagsOptions) : '';
    lines.push(`        starlightTags(${tagsArg}),`);
  }
  if (hasKbd) {
    // starlight-kbd 0.4.0+ requires a `types` array with exactly one
    // entry flagged `default: true`. Material's `pymdownx.keys` doesn't
    // carry layout metadata, so emit a single default type the user can
    // extend.
    lines.push(
      "        starlightKbd({ types: [{ id: 'default', label: 'Keyboard', default: true }] }),",
    );
  }
  if (hasGithubAlerts) {
    lines.push('        starlightGithubAlerts(),');
  }
  if (hasAnnouncement) {
    // Plugin requires user to fill in announcement text/schedule; converter
    // emits a placeholder so users know exactly what to fill in.
    lines.push(
      "        starlightAnnouncement({ title: 'Announcement', message: 'Configure starlight-announcement options here.' }),",
    );
  }
  if (hasPageActions) {
    lines.push('        starlightPageActions(),');
  }
  if (hasHeadingBadges) {
    lines.push('        starlightHeadingBadges(),');
  }
  if (hasContributorList) {
    // The converter has no git port, so it cannot enumerate authors at
    // conversion time. Emit a placeholder `list: []` the user fills in
    // post-install — same pattern as starlight-announcement above.
    lines.push(
      '        // TODO: populate `list` with your contributors (each: { name, url, avatar }).',
    );
    lines.push('        starlightContributorList({ list: [] }),');
  }
  if (enableLinksValidator) {
    // Migrated MkDocs sites routinely link to pages that the original build
    // generated dynamically (`mkdocs-click` produces a CLI reference,
    // `mkdocstrings` produces autodoc pages) and to non-content paths
    // (`/LICENSE`, `/CHANGELOG`, `/CONTRIBUTING`, etc.) that point at
    // GitLab/GitHub web surfaces or static files. The plugin's defaults
    // reject all of these at `astro build`. Soften the policy and exclude
    // common non-content paths so the build completes; the converter's own
    // `broken-link` diagnostic catches genuine cross-content link issues
    // during conversion (surfaced in MIGRATION_NOTES.md).
    lines.push(
      "        starlightLinksValidator({ errorOnRelativeLinks: false, errorOnInvalidHashes: false, errorOnLocalLinks: false, exclude: ['/LICENSE', '/LICENSE.md', '/LICENSE.txt', '/CHANGELOG', '/CHANGELOG.md', '/CONTRIBUTING', '/CONTRIBUTING.md', '/CODE_OF_CONDUCT', '/CODE_OF_CONDUCT.md', '/SECURITY', '/SECURITY.md', '/COPYING', '/COPYING.md'] }),",
    );
  }
  lines.push('      ],');
  lines.push('    }),');
  if (hasMermaid) {
    lines.push('    mermaid(),');
  }
  if (hasD2) {
    // astro-d2 shells out to the `d2` CLI at build time — it must be on
    // PATH (https://d2lang.com/tour/install) or builds fail.
    lines.push('    d2(),');
  }
  lines.push('  ],');

  if (hasMath) {
    lines.push('  markdown: {');
    lines.push('    processor: unified({');
    lines.push('      remarkPlugins: [remarkMath],');
    lines.push('      rehypePlugins: [rehypeKatex],');
    lines.push('    }),');
    lines.push('  },');
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Escape every character that would terminate a JS quoted-string literal or
 * inject a syntax error if left literal. The order matters: backslash MUST
 * come first so subsequent insertions of `\n`/`\r`/`\t` aren't double-escaped.
 *
 * Real-world break (dokka-material-mkdocs): a YAML block scalar
 *   `site_description: |
 *      Embed your Kotlin documentation comments…`
 * survives as `"Embed…\n"`. Without `\\n` substitution the trailing newline
 * lands inside `description: '…\n'` in the emitted `astro.config.mjs` and
 * crashes the dev server with "invalid JS syntax".
 */
function escapeForString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function quote(value: string): string {
  return `'${escapeForString(value).replace(/'/g, "\\'")}'`;
}

/** Double-quoted string emit, used for values that commonly contain single
 *  quotes (e.g., inline JavaScript snippets that call `gtag('config', ...)`). */
function quoteDouble(value: string): string {
  return `"${escapeForString(value).replace(/"/g, '\\"')}"`;
}

function quoteKey(value: string): string {
  // Bare-identifier keys (e.g., `root`, `en`) can be emitted unquoted; keys
  // with hyphens (`zh-CN`) require quoting in JS object literals.
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : quote(value);
}

/**
 * Serialize the sidebar tree as a starlight-sidebar-topics invocation.
 * Each top-level entry becomes a topic: groups carry their subtree as the
 * topic's sidebar `items` and link to their first resolvable page;
 * standalone pages/links become link-only topics — mirroring how Material
 * renders top-level nav sections and pages as header tabs.
 */
function serializeSidebarTopics(
  entries: ReadonlyArray<SidebarEntry>,
  excludeGlobs: ReadonlyArray<string>,
): string {
  const topics = entries.map((entry) => renderTopic(entry));
  const exclude = `{ exclude: [${excludeGlobs.map(quote).join(', ')}] }`;
  return `starlightSidebarTopics([\n${topics.map((t) => `  ${t},`).join('\n')}\n], ${exclude})`;
}

function renderTopic(entry: SidebarEntry): string {
  switch (entry.kind) {
    case 'slug': {
      const label = entry.label ?? (entry.slug === '' ? 'Overview' : entry.slug);
      if (entry.slug === '') {
        // Root page: link-only — it lives in the exclude list (see above).
        return `{ label: ${quote(label)}, link: '/' }`;
      }
      // The `items` entry CLAIMS the page for this topic; a link-only topic
      // would leave its own page topic-less and the plugin hard-errors on
      // any unclaimed page.
      return `{ label: ${quote(label)}, link: ${quote(slugToLink(entry.slug))}, items: [${quote(entry.slug)}] }`;
    }
    case 'link':
      return `{ label: ${quote(entry.label)}, link: ${quote(entry.href)} }`;
    case 'group': {
      const link = firstLinkOf(entry.items) ?? '/';
      const items = indentTopicItems(serializeSidebar(entry.items));
      return `{ label: ${quote(entry.label)}, link: ${quote(link)}, items: ${items} }`;
    }
    case 'auto': {
      const inner = `{ autogenerate: { directory: ${quote(entry.directory)} } }`;
      return `{ label: ${quote(entry.label)}, link: ${quote(`/${entry.directory}/`)}, items: [${inner}] }`;
    }
  }
}

/** Depth-first search for the first concrete page a topic can land on. */
function firstLinkOf(entries: ReadonlyArray<SidebarEntry>): string | null {
  for (const entry of entries) {
    switch (entry.kind) {
      case 'slug':
        return slugToLink(entry.slug);
      case 'link':
        return entry.href;
      case 'auto':
        return `/${entry.directory}/`;
      case 'group': {
        const nested = firstLinkOf(entry.items);
        if (nested !== null) return nested;
      }
    }
  }
  return null;
}

function slugToLink(slug: string): string {
  return slug === '' ? '/' : `/${slug}/`;
}

/** Reflow a serializeSidebar literal for embedding as a topic's `items`. */
function indentTopicItems(serialized: string): string {
  const lines = serialized.split('\n');
  if (lines.length <= 1) return serialized;
  return lines.map((line, idx) => (idx === 0 ? line : `  ${line}`)).join('\n');
}

/** Reflow the topics invocation under the `plugins:` array indentation. */
function indentTopics(serialized: string): string {
  const lines = serialized.split('\n');
  if (lines.length <= 1) return serialized;
  return lines.map((line, idx) => (idx === 0 ? line : `        ${line}`)).join('\n');
}

function indentSidebar(serialized: string): string {
  // The sidebar serializer emits at top-level; reflow it under the
  // `sidebar:` key by adding 6 spaces to every line after the first.
  const lines = serialized.split('\n');
  if (lines.length <= 1) {
    return serialized;
  }
  return lines.map((line, idx) => (idx === 0 ? line : `      ${line}`)).join('\n');
}

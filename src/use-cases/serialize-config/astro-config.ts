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
import { serializeSidebar } from './sidebar.js';
import type { DetectedFeature } from './package-json.js';

export interface AstroConfigInput {
  readonly siteName: string;
  readonly siteDescription: string | null;
  readonly siteUrl: string | null;
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
  readonly tableOfContents?: false | { readonly minHeadingLevel: number; readonly maxHeadingLevel: number };
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
  /** Arbitrary entries to inject into Starlight's head[] config. Generalizes
   *  `extraJsEntries`: each entry can be a `<script>` (with src or inline
   *  content), a `<link>`, or a `<meta>` tag. Used today for analytics
   *  injection from `extra.analytics`. */
  readonly extraHeadEntries?: ReadonlyArray<{
    readonly tag: 'script' | 'link' | 'meta';
    readonly attrs?: Readonly<Record<string, string | boolean | number>>;
    readonly content?: string;
  }>;
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

  const imports: string[] = [
    `import { defineConfig } from 'astro/config';`,
    `import starlight from '@astrojs/starlight';`,
  ];
  if (hasMermaid) {
    imports.push(`import mermaid from 'astro-mermaid';`);
  }
  if (hasImageZoom) {
    imports.push(`import imageZoom from 'starlight-image-zoom';`);
  }
  if (hasVersions) {
    imports.push(`import starlightVersions from 'starlight-versions';`);
  }
  if (hasBlog) {
    imports.push(`import starlightBlog from 'starlight-blog';`);
  }
  if (hasTags) {
    imports.push(`import starlightTags from 'starlight-tags';`);
  }
  if (hasMath) {
    imports.push(`import remarkMath from 'remark-math';`);
    imports.push(`import rehypeKatex from 'rehype-katex';`);
  }
  if (input.enableLinksValidator === true) {
    imports.push(`import starlightLinksValidator from 'starlight-links-validator';`);
  }

  const lines: string[] = [imports.join('\n'), '', 'export default defineConfig({'];

  if (input.siteUrl !== null) {
    lines.push(`  site: ${quote(input.siteUrl)},`);
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
  lines.push(`      sidebar: ${indentSidebar(serializeSidebar(input.sidebar))},`);
  const cssEntries = ['./src/styles/mkdocs-migration.css'];
  for (const e of input.extraCssEntries ?? []) cssEntries.push(e);
  lines.push(
    `      customCss: [${cssEntries.map(quote).join(', ')}],`,
  );
  const extraJs = input.extraJsEntries ?? [];
  const extraHead = input.extraHeadEntries ?? [];
  if (extraJs.length > 0 || extraHead.length > 0) {
    lines.push('      head: [');
    for (const js of extraJs) {
      const attrs: string[] = [`src: ${quote(js.src)}`];
      if (js.type !== undefined) attrs.push(`type: ${quote(js.type)}`);
      if (js.async === true) attrs.push('async: true');
      if (js.defer === true) attrs.push('defer: true');
      lines.push(
        `        { tag: 'script', attrs: { ${attrs.join(', ')} } },`,
      );
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
    lines.push(`      defaultLocale: ${quote(input.i18n.defaultLocale)},`);
    lines.push('      locales: {');
    for (const entry of input.i18n.locales) {
      // Starlight uses `root` as the key for the default locale's directory
      // (which has no prefix in the URL tree).
      const key = entry.isDefault ? 'root' : entry.code;
      lines.push(
        `        ${quoteKey(key)}: { label: ${quote(entry.label)}, lang: ${quote(entry.code)} },`,
      );
    }
    lines.push('      },');
  }
  const enableLinksValidator = input.enableLinksValidator === true;
  if (hasImageZoom || hasVersions || hasBlog || hasTags || enableLinksValidator) {
    lines.push('      plugins: [');
    if (hasImageZoom) {
      lines.push('        imageZoom(),');
    }
    if (hasVersions) {
      lines.push('        starlightVersions({ versions: [{ slug: \'2.0\' }] }),');
    }
    if (hasBlog) {
      lines.push('        starlightBlog(),');
    }
    if (hasTags) {
      lines.push('        starlightTags(),');
    }
    if (enableLinksValidator) {
      lines.push('        starlightLinksValidator(),');
    }
    lines.push('      ],');
  }
  lines.push('    }),');
  if (hasMermaid) {
    lines.push('    mermaid(),');
  }
  lines.push('  ],');

  if (hasMath) {
    lines.push('  markdown: {');
    lines.push('    remarkPlugins: [remarkMath],');
    lines.push('    rehypePlugins: [rehypeKatex],');
    lines.push('  },');
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Double-quoted string emit, used for values that commonly contain single
 *  quotes (e.g., inline JavaScript snippets that call `gtag('config', ...)`). */
function quoteDouble(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function quoteKey(value: string): string {
  // Bare-identifier keys (e.g., `root`, `en`) can be emitted unquoted; keys
  // with hyphens (`zh-CN`) require quoting in JS object literals.
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) ? value : quote(value);
}

function indentSidebar(serialized: string): string {
  // The sidebar serializer emits at top-level; reflow it under the
  // `sidebar:` key by adding 6 spaces to every line after the first.
  const lines = serialized.split('\n');
  if (lines.length <= 1) {
    return serialized;
  }
  return lines
    .map((line, idx) => (idx === 0 ? line : `      ${line}`))
    .join('\n');
}

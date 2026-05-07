/**
 * Wizard learn-more links. Pure data: maps Tier 1 prompt triggers and known
 * MkDocs plugin/extension names to canonical docs URLs the wizard surfaces
 * inline so the user has a one-click destination for every "we suggest X" or
 * "we can't auto-convert Y" line in the prompt flow.
 *
 * Two registries:
 *   - TIER1_DOCS: every `Tier1Trigger` has an entry. Enforced by test, so a
 *     new trigger added without a URL fails the suite.
 *   - PLUGIN_DOCS: open registry — best-effort URLs for plugins/extensions
 *     `diagnose-plugins.ts` flags as needing manual attention. `pluginDocsUrl`
 *     returns null when no URL is known.
 */
import type { Tier1Trigger } from './tier1-trigger.js';

export const TIER1_DOCS: Readonly<Record<Tier1Trigger, string>> = {
  tabs: 'https://starlight.astro.build/components/tabs/',
  'sidebar-topics': 'https://starlight-sidebar-topics.netlify.app/',
  snippets:
    'https://squidfunk.github.io/mkdocs-material/setup/extensions/python-markdown-extensions/#snippets',
  rss: 'https://docs.astro.build/en/recipes/rss/',
  i18n: 'https://starlight.astro.build/guides/i18n/',
  mike: 'https://starlight-versions.vercel.app/',
  palette: 'https://starlight.astro.build/guides/css-and-tailwind/',
  'extra-assets': 'https://starlight.astro.build/guides/css-and-tailwind/',
};

export function tier1DocsUrl(trigger: Tier1Trigger): string {
  return TIER1_DOCS[trigger];
}

/**
 * MkDocs plugin/extension name → docs URL for the closest Starlight, Astro,
 * or community plugin equivalent (or, where no equivalent exists, the
 * upstream Material/MkDocs page so the user can read what they need to
 * recreate manually).
 */
export const PLUGIN_DOCS: Readonly<Record<string, string>> = {
  // Plugins with a Starlight or Astro equivalent.
  search: 'https://starlight.astro.build/guides/site-search/',
  social: 'https://www.npmjs.com/package/astro-og-canvas',
  glightbox: 'https://github.com/HiDeoo/starlight-image-zoom',
  blog: 'https://starlight-blog-docs.vercel.app/',
  tags: 'https://starlight-tags.vercel.app/',
  mike: 'https://starlight-versions.vercel.app/',
  i18n: 'https://starlight.astro.build/guides/i18n/',
  optimize: 'https://docs.astro.build/en/guides/images/',
  'mkdocs-swagger-ui-tag': 'https://starlight-openapi.vercel.app/',
  'swagger-ui-tag': 'https://starlight-openapi.vercel.app/',
  'mkdocs-redoc-tag': 'https://starlight-openapi.vercel.app/',
  'render-swagger': 'https://starlight-openapi.vercel.app/',
  'pdf-export': 'https://github.com/Fryuni/starlight-to-pdf',
  'with-pdf': 'https://github.com/Fryuni/starlight-to-pdf',
  'git-authors': 'https://github.com/HiDeoo/starlight-contributor-list',
  'git-committers': 'https://github.com/HiDeoo/starlight-contributor-list',

  // No direct equivalent — link to upstream so the user knows what to
  // recreate.
  meta: 'https://squidfunk.github.io/mkdocs-material/plugins/meta/',
  typeset: 'https://squidfunk.github.io/mkdocs-material/plugins/typeset/',
  privacy: 'https://squidfunk.github.io/mkdocs-material/plugins/privacy/',
  projects: 'https://squidfunk.github.io/mkdocs-material/plugins/projects/',
  mkdocstrings: 'https://mkdocstrings.github.io/',
  'mkdocs-jupyter': 'https://github.com/danielfrg/mkdocs-jupyter',
  'gen-files': 'https://oprypin.github.io/mkdocs-gen-files/',
  'print-site': 'https://timvink.github.io/mkdocs-print-site-plugin/',
  monorepo: 'https://github.com/backstage/mkdocs-monorepo-plugin',
  multirepo: 'https://github.com/jdoiro3/mkdocs-multirepo-plugin',
  'table-reader': 'https://timvink.github.io/mkdocs-table-reader-plugin/',
  img2fig: 'https://github.com/stuebersystems/mkdocs-img2fig-plugin',
  click: 'https://click.palletsprojects.com/en/stable/documentation/',
  'mkdocs-click': 'https://click.palletsprojects.com/en/stable/documentation/',
  info: 'https://squidfunk.github.io/mkdocs-material/plugins/info/',
  offline: 'https://squidfunk.github.io/mkdocs-material/plugins/offline/',
  group: 'https://squidfunk.github.io/mkdocs-material/plugins/group/',
  macros: 'https://mkdocs-macros-plugin.readthedocs.io/',
  exclude: 'https://github.com/apenwarr/mkdocs-exclude',
  'mkdocs-bibtex': 'https://github.com/shyamd/mkdocs-bibtex',

  // PyMdown extensions surfaced as diagnostics.
  'pymdownx.arithmatex': 'https://katex.org/docs/autorender.html',
  'pymdownx.progressbar':
    'https://facelessuser.github.io/pymdown-extensions/extensions/progressbar/',
  'pymdownx.striphtml': 'https://facelessuser.github.io/pymdown-extensions/extensions/striphtml/',
  'pymdownx.blocks.dialog':
    'https://facelessuser.github.io/pymdown-extensions/extensions/blocks/plugins/dialog/',
  'pymdownx.blocks.grid':
    'https://facelessuser.github.io/pymdown-extensions/extensions/blocks/plugins/grid/',
  'pymdownx.escapeall': 'https://facelessuser.github.io/pymdown-extensions/extensions/escapeall/',
  'pymdownx.pathconverter':
    'https://facelessuser.github.io/pymdown-extensions/extensions/pathconverter/',
  'pymdownx.saneheaders':
    'https://facelessuser.github.io/pymdown-extensions/extensions/saneheaders/',
};

export function pluginDocsUrl(name: string): string | null {
  return PLUGIN_DOCS[name] ?? null;
}

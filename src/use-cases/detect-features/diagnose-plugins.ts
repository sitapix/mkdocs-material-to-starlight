/**
 * Diagnose `mkdocs.yml` plugins the converter cannot translate. Each entry
 * produces a `Diagnostic` for `MIGRATION_NOTES.md` and
 * `migration-report.json`.
 *
 * Severities:
 *   - info: Astro/Starlight built-ins cover the plugin (e.g. `optimize`
 *     rides the astro:assets pipeline). No user action.
 *   - warning: no Starlight equivalent — user must reimplement manually.
 *   - warning: deprecated by Material; recommendation is to drop it.
 *
 * Plugins with a clean substitution (`blog`, `tags`, `mike`, `glightbox`)
 * route through `from-plugins.ts` and do NOT diagnose here. `search` emits
 * only `plugin-search-replaced` info because users routinely ask whether
 * the converter handled search.
 *
 * Pure.
 */

import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'mkdocs-material-to-starlight';

interface PluginDiagnosticSpec {
  readonly ruleId: string;
  readonly severity: 'info' | 'warning';
  readonly message: string;
}

const PLUGIN_DIAGNOSTICS: ReadonlyMap<string, PluginDiagnosticSpec> = new Map([
  [
    'search',
    {
      ruleId: 'plugin-search-replaced',
      severity: 'info',
      message:
        'Material/MkDocs `search` plugin detected — replaced by Starlight\'s built-in Pagefind search. Lunr-specific options (`search.lang`, `search.separator`, `search.pipeline`) are dropped; configure Pagefind via the starlight `pagefind` option for custom tokenization.',
    },
  ],
  [
    'social',
    {
      ruleId: 'plugin-social-mapped',
      severity: 'info',
      message:
        'Material `social` plugin (per-page OG card PNGs) detected — auto-wired to `astro-og-canvas`. The converter installs the package and emits a stub endpoint at `src/pages/og/[...slug].png.ts` that you must customize (logo, fonts, colors). Note: distinct from Starlight\'s `social: []` config (header social-media icon links), which is wired separately from `extra.social[]` in mkdocs.yml.',
    },
  ],
  [
    'meta',
    {
      ruleId: 'plugin-meta-no-equivalent',
      severity: 'warning',
      message:
        'Material `meta` plugin applies frontmatter recursively from .meta.yml; Starlight has no folder-scoped frontmatter cascade. Inline the affected frontmatter into each page or extend `docsSchema()` manually.',
    },
  ],
  [
    'typeset',
    {
      ruleId: 'plugin-typeset-deprecated',
      severity: 'warning',
      message:
        'Material `typeset` plugin (rich nav/TOC formatting) is documented as deprecated/maintenance-mode. Starlight sidebar accepts plain strings only — formatting is intentionally lost.',
    },
  ],
  [
    'privacy',
    {
      ruleId: 'plugin-privacy-no-equivalent',
      severity: 'warning',
      message:
        'Material `privacy` plugin (self-host external assets at build time) has no Starlight equivalent. Replicate via a custom rehype plugin paired with a build-time fetcher and content-hashed cache.',
    },
  ],
  [
    'optimize',
    {
      ruleId: 'plugin-optimize-subsumed',
      severity: 'info',
      message:
        'Material `optimize` plugin (image compression) is subsumed by Astro\'s built-in `astro:assets` / sharp pipeline. No action required.',
    },
  ],
  [
    'projects',
    {
      ruleId: 'plugin-projects-deprecated',
      severity: 'warning',
      message:
        'Material `projects` plugin (multi-site monorepo) is documented as deprecated. Use Turbo or Nx workspaces with separate Astro configs if multi-site builds are required.',
    },
  ],
  [
    'mkdocstrings',
    {
      ruleId: 'plugin-mkdocstrings-no-equivalent',
      severity: 'warning',
      message:
        'mkdocstrings (Python API autodoc) has no Starlight path. The Starlight `starlight-typedoc` plugin covers TypeScript only. Recreate Python autodoc as a custom Astro content loader.',
    },
  ],
  [
    'mkdocs-jupyter',
    {
      ruleId: 'plugin-jupyter-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-jupyter (.ipynb rendering) has no Starlight equivalent. Convert notebooks to Markdown ahead of time or implement a custom Astro loader for .ipynb.',
    },
  ],
  [
    'i18n',
    {
      ruleId: 'plugin-i18n-needs-rename',
      severity: 'info',
      message:
        'mkdocs-static-i18n locales detected — per-locale source files (e.g. page.fr.md) have been renamed to Starlight\'s directory layout (fr/page.md) automatically. You still need to add a `locales: { … }` block to astro.config.mjs to register the locales with Starlight.',
    },
  ],
  [
    'gen-files',
    {
      ruleId: 'plugin-gen-files-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-gen-files (programmatic .md generation) has no automatic Starlight equivalent. Run the generator before conversion to produce real files, or port it to an Astro content loader.',
    },
  ],
  [
    'print-site',
    {
      ruleId: 'plugin-print-site-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-print-site-plugin (single concatenated print page) has no Starlight equivalent. Recreate via a custom `src/pages/print.astro` endpoint paired with a print stylesheet.',
    },
  ],
  [
    'monorepo',
    {
      ruleId: 'plugin-monorepo-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-monorepo-plugin (multiple sub-docs trees) has no Starlight equivalent. Compose via Turbo/Nx workspaces with a single Astro project and per-team subdirectories under src/content/docs/.',
    },
  ],
  [
    'multirepo',
    {
      ruleId: 'plugin-multirepo-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-multirepo-plugin (pulls docs from multiple repos at build time) has no Starlight equivalent. Use git submodules or a CI clone step before astro build.',
    },
  ],
  [
    'table-reader',
    {
      ruleId: 'plugin-table-reader-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-table-reader-plugin loads tabular data via macro calls; convert source data to Markdown tables ahead of time or write an Astro content loader.',
    },
  ],
  [
    'img2fig',
    {
      ruleId: 'plugin-img2fig-no-equivalent',
      severity: 'info',
      message:
        'mkdocs-img2fig-plugin auto-wraps images in <figure>; use pymdownx.blocks.caption in source or wrap manually after conversion.',
    },
  ],
  [
    'click',
    {
      ruleId: 'plugin-click-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-click introspects Click CLI; pre-render `your-cli --help` output and embed as a code block.',
    },
  ],
  [
    'mkdocs-click',
    {
      ruleId: 'plugin-click-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-click (markdown extension form) introspects Click CLI; pre-render `your-cli --help` output and embed as a code block.',
    },
  ],
  [
    'info',
    {
      ruleId: 'plugin-info-subsumed',
      severity: 'info',
      message:
        'Material `info` plugin (bug-report ZIP) has no equivalent and is not needed for Astro projects.',
    },
  ],
  [
    'offline',
    {
      ruleId: 'plugin-offline-no-equivalent',
      severity: 'warning',
      message:
        'Material `offline` plugin (file:// builds) has no Astro equivalent; serve the built site via local web server instead.',
    },
  ],
  [
    'group',
    {
      ruleId: 'plugin-group-no-equivalent',
      severity: 'info',
      message:
        'Material `group` plugin (conditional plugin grouping) has no Astro equivalent; use process.env checks in astro.config.mjs to gate integrations.',
    },
  ],
  [
    'macros',
    {
      ruleId: 'plugin-macros-detected',
      severity: 'warning',
      message:
        'mkdocs-macros-plugin (Jinja2) cannot be evaluated by the converter. Every `{{ … }}` and `{% … %}` occurrence in source files is reported in MIGRATION_NOTES with line numbers so you can replace them manually.',
    },
  ],
  [
    'mkdocs-swagger-ui-tag',
    {
      ruleId: 'plugin-swagger-ui-mapped',
      severity: 'info',
      message:
        'mkdocs-swagger-ui-tag plugin detected. Install `starlight-openapi` and add it to your Astro Starlight integration. See https://starlight-openapi.vercel.app for setup. Each `<swagger-ui>` tag in source must be manually replaced with the appropriate Starlight Openapi component or page route.',
    },
  ],
  [
    'swagger-ui-tag',
    {
      ruleId: 'plugin-swagger-ui-mapped',
      severity: 'info',
      message:
        'mkdocs-swagger-ui-tag plugin detected. Install `starlight-openapi` and add it to your Astro Starlight integration. See https://starlight-openapi.vercel.app for setup. Each `<swagger-ui>` tag in source must be manually replaced with the appropriate Starlight Openapi component or page route.',
    },
  ],
  [
    'pdf-export',
    {
      ruleId: 'plugin-pdf-export-mapped',
      severity: 'info',
      message:
        'mkdocs-pdf-export-plugin detected. Closest Starlight equivalent: `starlight-to-pdf` (CLI tool — runs after `astro build` against the built site). Install with `npm i -D starlight-to-pdf` and run `npx starlight-to-pdf <url>` after each build, or wire it into your CI release step. The converter does not auto-install it because CLI tools are not Astro integrations.',
    },
  ],
  [
    'with-pdf',
    {
      ruleId: 'plugin-pdf-export-mapped',
      severity: 'info',
      message:
        'mkdocs-with-pdf (PDF export variant) detected. Closest Starlight equivalent: `starlight-to-pdf` (CLI tool — runs after `astro build`). Install with `npm i -D starlight-to-pdf` and run `npx starlight-to-pdf <url>` after each build. The converter does not auto-install it because CLI tools are not Astro integrations.',
    },
  ],
  [
    'exclude',
    {
      ruleId: 'plugin-exclude-mapped',
      severity: 'info',
      message:
        'mkdocs-exclude detected — auto-handled: matching source files are filtered out before conversion, so they never become Starlight pages. Both `glob:` (fnmatch-style) and `regex:` (JavaScript regex) are honored. No further action required; remove the plugin block from the converted project\'s configuration.',
    },
  ],
  [
    'mkdocs-redoc-tag',
    {
      ruleId: 'plugin-swagger-ui-mapped',
      severity: 'info',
      message:
        'mkdocs-redoc-tag plugin detected (alternative OpenAPI renderer). Install `starlight-openapi` and add it to your Starlight integration. Each `<redoc>` tag in source must be manually replaced with the appropriate `starlight-openapi` schema route — see https://starlight-openapi.vercel.app for setup.',
    },
  ],
  [
    'render-swagger',
    {
      ruleId: 'plugin-swagger-ui-mapped',
      severity: 'info',
      message:
        'mkdocs-render-swagger-plugin detected (alternative OpenAPI renderer). Install `starlight-openapi` and add it to your Starlight integration. Each `!!swagger schema.yml!!` macro in source must be manually replaced with the appropriate `starlight-openapi` schema route — see https://starlight-openapi.vercel.app for setup.',
    },
  ],
  [
    'git-authors',
    {
      ruleId: 'plugin-git-authors-mapped',
      severity: 'info',
      message:
        'mkdocs-git-authors-plugin detected (per-page git contributors) — auto-wired to `starlight-contributor-list` (project-wide contributors footer). The converter installs the package and emits the integration block with a placeholder `list: []`; populate it with your contributors. For true per-page authors (Starlight has no first-party block for that), write a small Astro component that reads `git log --format` at build time.',
    },
  ],
  [
    'git-committers',
    {
      ruleId: 'plugin-git-authors-mapped',
      severity: 'info',
      message:
        'mkdocs-git-committers-2 detected (per-page git committers) — auto-wired to `starlight-contributor-list` (project-wide contributors footer). The converter installs the package and emits the integration block with a placeholder `list: []`; populate it with your committers. For true per-page committers (Starlight has no first-party block for that), write a small Astro component that reads `git log --format` at build time.',
    },
  ],
  [
    'mkdocs-bibtex',
    {
      ruleId: 'plugin-mkdocs-bibtex-no-equivalent',
      severity: 'warning',
      message:
        'mkdocs-bibtex plugin detected (BibTeX-driven citations). No Starlight equivalent. Pre-render citations to inline footnotes ahead of conversion, or write a custom remark plugin that reads your `.bib` file and inlines references.',
    },
  ],
  // PyMdown extensions (Tier 3 long-tail) — extensions that the converter does
  // not transform. Each emits a single info/warning diagnostic so the user sees
  // a structured note in MIGRATION_NOTES.md and can audit which features need
  // manual handling.
  [
    'pymdownx.arithmatex',
    {
      ruleId: 'extension-arithmatex-detected',
      severity: 'info',
      message:
        '`pymdownx.arithmatex` (math rendering) detected. The converter has automatically: (1) added `remark-math`, `rehype-katex`, and `katex` to `package.json`; (2) wired both plugins into `astro.config.mjs` `markdown.{remarkPlugins,rehypePlugins}`; and (3) registered `katex/dist/katex.min.css` in Starlight `customCss`. Run `npm install` and formulas will render — no further configuration needed. To swap KaTeX for MathJax, replace `rehype-katex` with `rehype-mathjax` in both files and remove the `katex.min.css` line.',
    },
  ],
  [
    'pymdownx.progressbar',
    {
      ruleId: 'extension-progressbar-no-equivalent',
      severity: 'info',
      message:
        '`pymdownx.progressbar` (`[=85% "label"]` / `[=1/2 "Half"]`) detected — promoted to native HTML `<progress value="N" max="100">` elements at the normalize stage. Material\'s `.progress-bar` / `.progress-label` CSS classes and the `level_class`/`add_classes` Material tweaks are not preserved.',
    },
  ],
  [
    'pymdownx.striphtml',
    {
      ruleId: 'extension-striphtml-subsumed',
      severity: 'info',
      message:
        '`pymdownx.striphtml` (build-time HTML stripper) detected — subsumed by the Astro/MDX pipeline, which handles HTML inclusion via its own component model. No action required.',
    },
  ],
  [
    'pymdownx.blocks.dialog',
    {
      ruleId: 'extension-blocks-dialog-no-equivalent',
      severity: 'warning',
      message:
        '`pymdownx.blocks.dialog` (`/// dialog | …` blocks) detected — no Starlight equivalent. Replace dialog blocks with a custom MDX component (e.g., `<Dialog>`) under `src/components/`, or convert them to admonitions/asides.',
    },
  ],
  [
    'pymdownx.blocks.grid',
    {
      ruleId: 'extension-blocks-grid-no-equivalent',
      severity: 'warning',
      message:
        '`pymdownx.blocks.grid` (generic CSS-grid block, distinct from `grid cards`) detected — no Starlight equivalent. The `<div class="grid cards">` shape is still mapped; only the bare `pymdownx.blocks.grid` form is unmapped. Replace with hand-written `<div class="sl-grid">` markup or a custom Astro component.',
    },
  ],
  [
    'pymdownx.escapeall',
    {
      ruleId: 'extension-escapeall-detected',
      severity: 'info',
      message:
        '`pymdownx.escapeall` detected. MDX and remark handle backslash escapes natively; some unusual character escapes that Python-Markdown allowed may behave differently in MDX (e.g., `\\!`, `\\(`). Common cases (`\\*`, `\\_`, `\\\\`) still work. Spot-check passages that rely on escaping unusual characters.',
    },
  ],
  [
    'pymdownx.pathconverter',
    {
      ruleId: 'extension-pathconverter-subsumed',
      severity: 'info',
      message:
        '`pymdownx.pathconverter` (relative-path rewriting) detected — subsumed by the converter\'s built-in link normalizer, which rewrites `.md` paths to Starlight slugs. No action required.',
    },
  ],
  [
    'pymdownx.saneheaders',
    {
      ruleId: 'extension-saneheaders-detected',
      severity: 'info',
      message:
        '`pymdownx.saneheaders` detected. Remark/MDX heading parsing follows CommonMark defaults, which approximate but do not exactly match saneheaders\' stricter parsing of `#` in inline contexts. Headings that worked under saneheaders should continue to work; spot-check edge cases.',
    },
  ],
  [
    'pymdownx.fancylists',
    {
      ruleId: 'extension-fancylists-promoted',
      severity: 'info',
      message:
        '`pymdownx.fancylists` (Roman/alpha numeral ordered lists) detected. The converter promotes `i. ii. iii.` and `a. b. c.` markers to `<ol type="i|I|a|A">` HTML so Starlight renders them with the correct numeral style. The `#.` "generic" marker is not handled — replace with explicit decimal markers if used.',
    },
  ],
  [
    'pymdownx.quotes',
    {
      ruleId: 'extension-quotes-callouts-routed',
      severity: 'info',
      message:
        '`pymdownx.quotes` detected. If `callouts: true` is set, the syntax (`> [!note]`, `> [!tip] Title`, `> [!warning]-` for collapsed) is identical to GitHub-flavored alerts and routes through `scan-github-alerts` automatically. The `starlight-github-alerts` plugin is auto-installed when alert markers are present.',
    },
  ],
  [
    'wikilinks',
    {
      ruleId: 'extension-wikilinks-rewritten',
      severity: 'info',
      message:
        '`wikilinks` extension detected. The converter rewrites `[[Page Name]]` to `[Page Name](/page-name/)` using lowercase + dash-separated slug derivation (Python-Markdown default). Custom `base_url` / `end_url` / `wiki_html_class` options are dropped — for full Obsidian compatibility, install `starlight-obsidian`.',
    },
  ],
  [
    'smarty',
    {
      ruleId: 'extension-smarty-recommend',
      severity: 'info',
      message:
        '`smarty` extension detected (smart quotes, em/en dashes, ellipsis substitutions). remark-parse does not perform these substitutions by default. Add `remark-smartypants` to `markdown.remarkPlugins` in `astro.config.mjs` to preserve the typography.',
    },
  ],
  [
    'pymdownx.extra',
    {
      ruleId: 'extension-pymdownx-extra-expanded',
      severity: 'info',
      message:
        '`pymdownx.extra` meta-bundle detected. The bundle aliases `betterem`, `superfences`, `footnotes`, `attr_list`, `def_list`, `tables`, `abbr`, and `md_in_html` — all already covered by the converter individually. No action required; bespoke `pymdownx.extra: { footnotes: { BACKLINK_TEXT } }` sub-options are dropped.',
    },
  ],
  [
    'pymdownx.betterem',
    {
      ruleId: 'extension-betterem-detected',
      severity: 'info',
      message:
        '`pymdownx.betterem` detected. remark-parse follows CommonMark emphasis rules, which approximate but do not exactly match betterem (smart-emphasis settings differ for mid-word `_underscore_` and `*asterisk*` token handling). Spot-check prose with intra-word emphasis.',
    },
  ],
  [
    'pymdownx.b64',
    {
      ruleId: 'extension-b64-subsumed',
      severity: 'info',
      message:
        '`pymdownx.b64` (base64-inline images) detected — subsumed by Astro\'s asset pipeline (`astro:assets`), which fingerprints and serves images via the build graph. Inlining as data: URLs is not the default; if specifically required, import images via `import logo from \'./logo.png\'; <img src={logo.src}>` in MDX.',
    },
  ],
  [
    'mkdocs-minify-plugin',
    {
      ruleId: 'plugin-minify-subsumed',
      severity: 'info',
      message:
        '`mkdocs-minify-plugin` detected — subsumed by Astro/Vite, which minify HTML/CSS/JS by default in production builds. No action required.',
    },
  ],
  [
    'mkdocs-glossary-plugin',
    {
      ruleId: 'plugin-glossary-recommend',
      severity: 'info',
      message:
        '`mkdocs-glossary-plugin` detected (hover-tooltip glossary terms). Recreate via the converter\'s built-in `abbr` handling (`*[TERM]: definition`) for plain-text definitions, or build a custom MDX `<Glossary>` component for richer tooltips. The Material `:icon:{ title="..." }` mechanism also offers an inline tooltip path.',
    },
  ],
  [
    'mkdocs-video',
    {
      ruleId: 'plugin-video-recommend',
      severity: 'info',
      message:
        '`mkdocs-video` detected — auto-converted: every `![type:video](url)` in source is promoted to a native HTML5 `<video src="url" controls>` element at the AST stage. Pages stay `.md`, no plugin install needed. For richer video-guide / course-style components, install `starlight-videos` and replace the emitted elements as needed.',
    },
  ],
  [
    'mkdocs-puml',
    {
      ruleId: 'plugin-puml-recommend',
      severity: 'info',
      message:
        '`mkdocs-puml` (PlantUML rendering) detected. Install `astro-plantuml` and add it to your Astro integrations — the same `@startuml...@enduml` fenced syntax is supported.',
    },
  ],
  [
    'plantuml-markdown',
    {
      ruleId: 'plugin-puml-recommend',
      severity: 'info',
      message:
        '`plantuml-markdown` detected. Install `astro-plantuml` and add it to your Astro integrations — the same `@startuml...@enduml` fenced syntax is supported.',
    },
  ],
  [
    'encryptcontent',
    {
      ruleId: 'plugin-encryptcontent-no-equivalent',
      severity: 'warning',
      message:
        '`mkdocs-encryptcontent-plugin` detected (per-page password encryption). No Starlight equivalent — Astro outputs static HTML with no client-side decryption layer. Either remove protected content from the public site, or wrap the deployed `dist/` directory in a custom auth gate (Cloudflare Access, Netlify password protection, etc.).',
    },
  ],
  [
    'charts',
    {
      ruleId: 'plugin-charts-no-equivalent',
      severity: 'warning',
      message:
        '`mkdocs-charts-plugin` detected (Vega-Lite block syntax). No first-class Starlight equivalent. Recreate via a custom MDX `<VegaChart>` component using vega-embed, or pre-render charts to SVG/PNG ahead of conversion.',
    },
  ],
  [
    'markdownextradata-plugin',
    {
      ruleId: 'plugin-markdownextradata-no-equivalent',
      severity: 'warning',
      message:
        '`mkdocs-markdownextradata-plugin` detected (`{{ var }}` Jinja-style variable interpolation from `extra.*`). The bare `{{ }}` syntax conflicts with MDX expressions. Use Astro\'s `import.meta.env.PUBLIC_*` env variables in MDX (`{import.meta.env.PUBLIC_MY_VAR}`) for the equivalent build-time interpolation.',
    },
  ],
  [
    'autorefs',
    {
      ruleId: 'plugin-autorefs-no-equivalent',
      severity: 'warning',
      message:
        '`mkdocs-autorefs` detected (mkdocstrings-style cross-references like `[mod.cls][]` and `[label][target]`). Starlight has no equivalent name-resolved cross-ref system. Convert each reference into an explicit link (`[label](/api/mod-cls/)`) — there is no Starlight plugin that auto-resolves bare object references against an inventory.',
    },
  ],
  [
    'audio',
    {
      ruleId: 'plugin-audio-recommend',
      severity: 'info',
      message:
        '`mkdocs-audio` detected — auto-converted: every `![type:audio](url)` in source is promoted to a native HTML5 `<audio src="url" controls>` element at the AST stage. Pages stay `.md`, no plugin or import needed.',
    },
  ],
  [
    'awesome-nav',
    {
      ruleId: 'plugin-awesome-nav-recognized',
      severity: 'info',
      message:
        '`awesome-nav` detected (the redesigned successor to `awesome-pages`). The converter loads any `.pages` files it finds in the project regardless of which plugin name is listed, so legacy `.pages` configs continue to drive the Starlight sidebar. If you have migrated to a non-`.pages` `awesome-nav` config format, that file is not yet recognized — port the navigation manually or fall back to `mkdocs.yml` `nav:`.',
    },
  ],
]);

export function diagnosePlugins(
  plugins: ReadonlyArray<MkdocsPlugin>,
  extensions: ReadonlyArray<{ readonly name: string }> = [],
): ReadonlyArray<Diagnostic> {
  const out: Diagnostic[] = [];
  const fired = new Set<string>();
  for (const item of [...plugins, ...extensions]) {
    const spec = PLUGIN_DIAGNOSTICS.get(item.name);
    if (spec === undefined) continue;
    if (fired.has(spec.ruleId)) continue;
    fired.add(spec.ruleId);
    out.push(
      createDiagnostic({
        severity: spec.severity,
        ruleId: spec.ruleId,
        message: spec.message,
        source: SOURCE,
      }),
    );
  }

  // Per-plugin custom-config detection. The auto-wired plugin substitutions
  // (blog → starlight-blog, glightbox → starlight-image-zoom, etc.) cover the
  // happy path with default options. When the user has customized the
  // upstream plugin, surface a single diagnostic listing the bespoke option
  // keys so they know which settings need hand-porting to the Starlight
  // plugin's own (different) configuration shape.
  const blog = plugins.find((p) => p.name === 'blog');
  if (blog !== undefined) {
    const customKeys = Object.keys(blog.options).filter(
      (k) => !DEFAULT_BLOG_KEYS.has(k),
    );
    if (customKeys.length > 0) {
      out.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'plugin-blog-custom-config',
          source: SOURCE,
          message:
            `Material \`blog\` plugin has bespoke options that \`starlight-blog\` does not honor as-is: ${customKeys.map((k) => '`' + k + '`').join(', ')}. ` +
            `Hand-port each one: URL formats (\`post_url_format\`, \`archive_url_format\`, \`categories_url_format\`) become Astro page route patterns under \`src/content/docs/\`; pagination settings (\`pagination_per_page\`) map to \`starlight-blog\`'s \`postsPerPage\`; ` +
            `\`authors_file\` becomes the plugin's \`authors\` config object; \`draft_if_future_date\` requires a content-collection filter; \`categories_allowed\` requires the same plus a Zod schema enum.`,
        }),
      );
    }
  }

  return out;
}

/**
 * The default `blog` plugin keys we already know how to translate (or that
 * are no-ops because Astro/Starlight-blog handle them differently). Anything
 * outside this set fires the `plugin-blog-custom-config` diagnostic.
 */
const DEFAULT_BLOG_KEYS: ReadonlySet<string> = new Set([
  'enabled',
  'blog_dir',
  'post_dir',
]);

/**
 * Diagnose `mkdocs.yml` plugins that the converter cannot translate into
 * Starlight automatically. Each entry produces a `Diagnostic` so the user
 * sees a structured note in `MIGRATION_NOTES.md` and `migration-report.json`.
 *
 * The taxonomy (severity + ruleId) is:
 *   - `info`     — plugin's job is taken over by Astro/Starlight built-ins
 *                  (e.g., `optimize` → astro:assets pipeline). No user action.
 *   - `warning`  — plugin has no Starlight equivalent and the user must
 *                  recreate the behavior manually if they need it.
 *   - `warning`  — plugin is deprecated by Material itself. Recommendation
 *                  is to drop it; the user can still reimplement if needed.
 *
 * Plugins with a clean Starlight substitution (`blog → starlight-blog`,
 * `tags → starlight-tags`, `mike → starlight-versions`,
 * `glightbox → starlight-image-zoom`) are routed by `from-plugins.ts` into
 * the `DetectedFeature` set and do NOT produce a diagnostic. The `search`
 * plugin produces only an info-level acknowledgement (`plugin-search-replaced`)
 * since users frequently ask "did the converter handle search?".
 *
 * Pure: takes a plugin list, returns `Diagnostic[]`.
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
      severity: 'warning',
      message:
        'mkdocs-exclude plugin detected. Astro/Starlight has no in-config path-exclusion mechanism: any file under `src/content/docs/` becomes a published page. Either (a) move excluded paths out of `src/content/docs/` so Astro never sees them, (b) add `draft: true` frontmatter to each excluded page (Astro skips drafts in production builds), or (c) write a custom Astro content-collection filter via `defineCollection({ filter })`.',
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
        'mkdocs-git-authors-plugin detected (per-page git contributors). Starlight has no per-page contributor block. Recreate via the `starlight-contributor-list` community plugin (project-wide contributors footer), or write a small Astro component that reads `git log --format` at build time for true per-page authors.',
    },
  ],
  [
    'git-committers',
    {
      ruleId: 'plugin-git-authors-mapped',
      severity: 'info',
      message:
        'mkdocs-git-committers-2 plugin detected (per-page git committers). Starlight has no per-page contributor block. Recreate via the `starlight-contributor-list` community plugin (project-wide contributors footer), or write a small Astro component that reads `git log --format` at build time for true per-page committers.',
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
      severity: 'warning',
      message:
        '`pymdownx.arithmatex` (math rendering) detected. The converter passes `$inline$` and `$$block$$` math through `remark-math`, but Astro needs a rehype renderer to display formulas. Install `rehype-katex` (preferred) or `rehype-mathjax` and wire it into `astro.config.mjs` `markdown.rehypePlugins`. Add `import "katex/dist/katex.min.css"` to your global CSS.',
    },
  ],
  [
    'pymdownx.progressbar',
    {
      ruleId: 'extension-progressbar-no-equivalent',
      severity: 'warning',
      message:
        '`pymdownx.progressbar` (`[=85% "label"]` progress bars) detected — no Starlight or Astro equivalent. Existing markers will pass through as literal text. Replace them with a custom component, an inline `<progress>` element, or static text.',
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

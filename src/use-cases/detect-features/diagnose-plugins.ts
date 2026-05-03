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

const SOURCE = 'mkdocs-to-starlight';

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
      ruleId: 'plugin-social-no-equivalent',
      severity: 'warning',
      message:
        'Material `social` plugin generates per-page OG/PNG cards; Starlight has no first-party equivalent. Recreate via `astro-og-canvas` or a custom Satori/Resvg pipeline if needed.',
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
  return out;
}

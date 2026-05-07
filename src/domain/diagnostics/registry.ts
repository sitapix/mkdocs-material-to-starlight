/**
 * The diagnostic registry: single declarative list of every `ruleId` the
 * converter is allowed to emit.
 *
 * Diagnostics are the converter's primary "this didn't go cleanly" channel.
 * Users grep `ruleId` in CI logs and `MIGRATION_NOTES.md`, so duplicates,
 * typos, or unregistered IDs break filtering and search.
 *
 * Three invariants, each backed by a test:
 *   1. Every production-emitted `ruleId` is registered.
 *   2. Every registry entry has a non-empty description and remediation path.
 *   3. IDs are unique.
 *
 * `relatedFeatureId` ties a diagnostic to a row in `conversion-mapping/table.ts`
 * so users can look up the canonical conversion description. Pure data.
 */

import type { Severity } from './diagnostic.js';

export interface DiagnosticEntry {
  /** Stable identifier emitted as `Diagnostic.ruleId`. */
  readonly id: string;
  /** Default severity when this rule fires. */
  readonly severity: Severity;
  /** One-line description of what triggers this diagnostic. */
  readonly description: string;
  /** Concrete remediation path the user should take. */
  readonly fix: string;
  /** Optional link to a row in the conversion-mapping table. */
  readonly relatedFeatureId?: string;
}

const REGISTRY_ENTRIES: ReadonlyArray<DiagnosticEntry> = [
  {
    id: 'broken-link',
    severity: 'warning',
    description: 'An internal `.md` link does not resolve to any source file in the slug map.',
    fix: 'Update the link target, restore the missing file, or remove the link.',
    relatedFeatureId: 'links-internal',
  },
  {
    id: 'nav-missing-target',
    severity: 'warning',
    description:
      'A nav entry in `mkdocs.yml` references a file that does not exist in the docs directory. Common cause: the file is synthesized at build time by an mkdocs hook or plugin (e.g., a Python hook that generates `changelog.md` from a CHANGELOG file) — the converter cannot run those hooks.',
    fix: 'Either pre-generate the file before running the converter, remove the nav entry, or replace it with a real file. The entry is dropped from the Starlight sidebar and a diagnostic is emitted; the rest of the conversion proceeds.',
  },
  {
    id: 'icon-unmapped',
    severity: 'warning',
    description:
      'A Material icon shortcode (`:material-foo:`, `:fontawesome-...:`, etc.) has no Starlight built-in equivalent in the curated map.',
    fix: 'Easiest path: install a third-party Iconify set (e.g. `@iconify-json/mdi`, `@iconify-json/fa6-brands`) and pass it to `astro-icon` — see HiDeoo\'s walkthrough at https://hideoo.dev/notes/starlight-third-party-icon-sets for the full setup. Alternative: add a project-local SVG to `src/icons/` and reference it via `<Icon name="local:..." />`, or extend the converter\'s curated icon mapping table.',
    relatedFeatureId: 'icons',
  },
  {
    id: 'missing-required-title',
    severity: 'error',
    description: "Frontmatter is missing the `title` field required by Starlight's docsSchema.",
    fix: 'Add a `title` field. This usually indicates a converter bug — `ensureTitle` should have synthesized one from the first H1.',
  },
  {
    id: 'unknown-frontmatter-field',
    severity: 'warning',
    description: "Frontmatter contains a top-level field that is not in Starlight's docsSchema.",
    fix: 'Open `src/content.config.ts` and tighten the inferred Zod types in the generated `docsSchema({ extend: z.object({ ... }) })` snippet (e.g. swap `z.unknown().optional()` for `z.string()` or `z.enum([...])`), or remove fields you do not need. See https://starlight.astro.build/reference/frontmatter/#customize-frontmatter-schema for the full schema reference.',
  },
  {
    id: 'unknown-jsx-component',
    severity: 'warning',
    description:
      'A JSX-style `<Component>` tag in an .mdx/.mdoc file is neither a Starlight built-in nor named-imported in the file.',
    fix: 'Add `import { Component } from "..."` at the top of the file, or replace the component with a Starlight built-in. Astro\'s MDX runtime fails the build with "Unknown component" otherwise.',
  },
  {
    id: 'snippet-url-not-supported',
    severity: 'warning',
    description:
      'A `--8<-- "https://…"` URL-form snippet was found. The converter does not download remote snippets at conversion time — PyMdown\'s `url_download` option enables an SSRF-style risk and is intentionally not implemented.',
    fix: 'Replace the URL with a local file copied into your snippets directory. If the remote content must stay remote, fetch it manually before conversion or write a custom Astro content loader to fetch at build time with explicit egress controls.',
    relatedFeatureId: 'snippets',
  },
  {
    id: 'snippet-cycle',
    severity: 'warning',
    description:
      'A `--8<--` snippet inclusion forms a cycle (file A includes file B which includes file A). The cycle is broken and the offending marker is left in source — not a build failure, but the include site still shows the literal `--8<--` directive in the rendered page.',
    fix: 'Break the cycle by inlining one side or restructuring the shared content into a separate non-cyclic file.',
    relatedFeatureId: 'snippets',
  },
  {
    id: 'snippet-depth-exceeded',
    severity: 'warning',
    description:
      'A `--8<--` snippet chain nests deeper than the configured maximum (default 8). The chain is truncated and the deepest marker is left in source.',
    fix: 'Flatten the snippet hierarchy or raise the depth limit if the structure is genuinely needed.',
    relatedFeatureId: 'snippets',
  },
  {
    id: 'snippet-malformed',
    severity: 'warning',
    description:
      'A snippet directive uses an unrecognized form (e.g., a block snippet without a matching closer).',
    fix: 'Repair the snippet syntax. The original line is preserved verbatim in the output for inspection.',
    relatedFeatureId: 'snippets',
  },
  {
    id: 'snippet-not-found',
    severity: 'warning',
    description:
      'A `--8<--` snippet references a file that cannot be resolved against any configured `base_path`.',
    fix: "Verify the snippet path, or pass `--snippet-base-path` to extend the resolver's search roots.",
    relatedFeatureId: 'snippets',
  },
  {
    id: 'snippet-section-not-found',
    severity: 'warning',
    description:
      'A `--8<-- "file.md:section"` reference targets a named section that has no `# --8<-- [start:section]` / `[end:section]` markers in the resolved file.',
    fix: 'Add matching start/end markers to the snippet source, or correct the section name in the reference.',
    relatedFeatureId: 'snippets',
  },
  {
    id: 'plugin-social-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists the Material `social` plugin (per-page OG/PNG cards); Starlight has no first-party equivalent.',
    fix: 'Recreate via `astro-og-canvas` or a custom Satori/Resvg pipeline if OG cards are required.',
    relatedFeatureId: 'plugin-social',
  },
  {
    id: 'plugin-autorefs-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists `mkdocs-autorefs` (mkdocstrings-companion cross-references like `[mod.cls][]`); Starlight has no name-resolved cross-ref system.',
    fix: 'Replace each `[label][target]` with an explicit `[label](/path/to/page/)` link. No Starlight plugin auto-resolves bare object references.',
  },
  {
    id: 'plugin-audio-recommend',
    severity: 'info',
    description:
      'mkdocs.yml lists `mkdocs-audio`; the `![type:audio](url)` syntax has no Starlight plugin equivalent.',
    fix: 'Replace with native HTML5 `<audio src="url" controls>` — works inline in markdown without imports.',
  },
  {
    id: 'media-html5-promoted',
    severity: 'info',
    description:
      'A `![type:audio](url)` or `![type:video](url)` image node was promoted to a native HTML5 `<audio>` or `<video>` element with `controls`.',
    fix: 'No action required. Pages keep the `.md` extension — native HTML5 media elements render without MDX. Add `width`, `poster`, or other attributes manually if needed.',
  },
  {
    id: 'plugin-awesome-nav-recognized',
    severity: 'info',
    description: 'mkdocs.yml lists `awesome-nav` (the redesigned successor of `awesome-pages`).',
    fix: 'The converter loads any `.pages` files it finds, so legacy `.pages` configs drive the sidebar regardless of plugin name. Port any non-`.pages` `awesome-nav` config formats manually.',
  },
  {
    id: 'plugin-meta-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists the Material `meta` plugin (folder-scoped frontmatter cascade); Starlight has no equivalent.',
    fix: 'Inline the affected frontmatter fields into each page, or extend `docsSchema()` and apply per-route middleware to stamp the values.',
  },
  {
    id: 'plugin-typeset-deprecated',
    severity: 'warning',
    description:
      'mkdocs.yml lists the `typeset` plugin (rich nav/TOC formatting). Material itself has marked this plugin deprecated.',
    fix: 'Drop the plugin; Starlight sidebar accepts plain strings only — formatting in nav is intentionally lost.',
  },
  {
    id: 'plugin-privacy-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists the Material `privacy` plugin (self-host external assets at build time); Starlight has no equivalent.',
    fix: "Replicate via a custom rehype plugin paired with a build-time fetcher and content-hashed cache, or use Astro's own asset pipeline if your deployment allows it.",
    relatedFeatureId: 'plugin-privacy',
  },
  {
    id: 'plugin-optimize-subsumed',
    severity: 'info',
    description:
      "mkdocs.yml lists the Material `optimize` plugin (image compression); Astro's `astro:assets` / sharp pipeline already covers this.",
    fix: 'No action required — Astro optimizes images automatically when referenced through `src/assets/` or via the `<Image />` component.',
    relatedFeatureId: 'plugin-optimize',
  },
  {
    id: 'plugin-projects-deprecated',
    severity: 'warning',
    description:
      'mkdocs.yml lists the Material `projects` plugin (multi-site monorepo). Material itself has marked this plugin deprecated.',
    fix: 'Use Turbo or Nx workspaces with separate Astro configs if multi-site builds are still required.',
  },
  {
    id: 'plugin-mkdocstrings-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists `mkdocstrings` (Python API autodoc); Starlight has no Python autodoc path. (TypeScript projects can use `starlight-typedoc` for the equivalent JS/TS workflow.)',
    fix: 'For Python: pre-generate Markdown from docstrings (Sphinx, pdoc, or `mkdocstrings -d` ahead of conversion), or write a custom Astro content loader that emits Starlight pages. For TypeScript: install `starlight-typedoc` and add it to your Starlight plugins array — it generates pages from TypeDoc output during the Astro build.',
  },
  {
    id: 'plugin-jupyter-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists `mkdocs-jupyter` (.ipynb rendering); Starlight has no native notebook renderer.',
    fix: 'Migration anchors: (1) `jupyter nbconvert --to markdown` — pre-render notebooks to Markdown before running the converter; outputs land in `docs_dir/` and convert normally. (2) `astro-quarto` — Quarto-based Astro integration that renders `.qmd` (the modern .ipynb superset). (3) Custom Astro loader: extend `docsLoader()` with an `.ipynb` reader that emits MDX entries; cell outputs become Expressive Code blocks.',
  },
  {
    id: 'astro-check-error',
    severity: 'error',
    description:
      '`astro check` reported a build-blocking error in the converted project (TypeScript, content-collection schema, or MDX compilation).',
    fix: 'Open the cited file at the cited location. Common causes: (1) frontmatter does not match `docsSchema`. Adjust the frontmatter or extend the schema in `src/content.config.ts` (https://starlight.astro.build/reference/frontmatter/). (2) MDX syntax error (https://mdxjs.com/docs/troubleshooting-mdx/). (3) TypeScript error in a `.astro` page. Re-run the converter after fixing the source. If the error originates in converter output, file a bug.',
  },
  {
    id: 'astro-check-warning',
    severity: 'warning',
    description:
      '`astro check` reported a non-fatal warning in the converted project (e.g., unused imports, deprecated APIs).',
    fix: 'Inspect the cited location. The site will still build; address warnings opportunistically.',
  },
  {
    id: 'astro-check-hint',
    severity: 'info',
    description: '`astro check` reported an informational hint about the converted project.',
    fix: 'No action required. Hints are surfaced for transparency.',
  },
  {
    id: 'astro-check-not-installed',
    severity: 'warning',
    description:
      '`astro check` could not run because `astro` is not installed in the output project (no `node_modules` or missing dependency).',
    fix: 'Run `npm install` in the output directory and re-invoke the converter with `--check`, or skip build validation if intentional.',
  },
  {
    id: 'astro-check-timeout',
    severity: 'error',
    description:
      '`astro check` exceeded the configured timeout and was killed before producing a verdict.',
    fix: 'Raise `--check-timeout`, or run `astro check` manually in the output directory to investigate why it hung.',
  },
  {
    id: 'astro-check-spawn-failed',
    severity: 'error',
    description:
      'The build-validation runner could not spawn `astro check` (binary not found on PATH, permission denied, or other OS-level failure).',
    fix: 'Verify Node.js is installed, the output directory contains a working `node_modules`, and the current process has permission to spawn child processes.',
  },
  {
    id: 'astro-check-unparsed-output',
    severity: 'warning',
    description:
      '`astro check` exited non-zero but no individual diagnostic lines could be parsed from its output.',
    fix: 'Inspect the raw output (printed with the diagnostic) and run `astro check` manually in the output directory to reproduce.',
  },
  {
    id: 'plugin-gen-files-no-equivalent',
    severity: 'warning',
    description:
      "mkdocs.yml lists `mkdocs-gen-files` (programmatic .md generation at build time); Astro's content collections are loaded statically, so there is no automatic translation.",
    fix: 'Run the gen-files Python script ahead of conversion to produce real .md files in `docs_dir`, OR rewrite the script as an Astro content loader (`docsLoader` returns a `Loader` you can extend) and emit synthetic entries from there.',
  },
  {
    id: 'plugin-print-site-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists `mkdocs-print-site-plugin` (single concatenated print page); Starlight has no equivalent.',
    fix: 'Recreate via a custom Astro endpoint at `src/pages/print.astro` that imports every page through `getCollection("docs")` and renders them in sequence, paired with a print stylesheet.',
  },
  {
    id: 'plugin-monorepo-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists `mkdocs-monorepo-plugin` (multiple sub-docs trees stitched into one site).',
    fix: "Use Turbo/Nx workspaces with a single Astro project and per-team subdirectories under `src/content/docs/`, or use Starlight's `sidebar.collapsed` groups to compose multi-team navigation.",
  },
  {
    id: 'plugin-multirepo-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs.yml lists `mkdocs-multirepo-plugin` (pulls docs from multiple git repos at build time).',
    fix: 'Use git submodules or a CI step that clones the source repos into the appropriate `src/content/docs/` subdirectories before `astro build`.',
  },
  {
    id: 'plugin-table-reader-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs-table-reader-plugin loads CSV/Excel/JSON/etc. as Markdown tables via macro calls. Astro has no direct equivalent.',
    fix: 'Convert the source data files to Markdown tables ahead of time, OR write a custom Astro content loader that emits content collection entries from the raw files.',
  },
  {
    id: 'plugin-img2fig-no-equivalent',
    severity: 'info',
    description:
      'mkdocs-img2fig-plugin wraps `<img>` in `<figure>` with the alt text as `<figcaption>`. Starlight does not auto-wrap; alt text is still preserved on the image.',
    fix: 'Use the `pymdownx.blocks.caption` directive in source (which the converter handles), or wrap target images in MDX with explicit `<figure>` markup after conversion.',
  },
  {
    id: 'plugin-click-no-equivalent',
    severity: 'warning',
    description:
      'mkdocs-click introspects Click CLI commands at build time. Starlight has no equivalent.',
    fix: "Run `your-cli --help` (or use Click's programmatic API) ahead of conversion and embed the output as a code block; or write a small Astro endpoint that imports your Click app and renders help text.",
  },
  {
    id: 'extension-mkautodoc-deprecated',
    severity: 'warning',
    description:
      'The `mkautodoc` Markdown extension is the legacy Tom Christie autodoc, predating mkdocstrings. Starlight has no equivalent.',
    fix: 'Migrate to mkdocstrings before conversion (and accept the existing mkdocstrings diagnostic), OR pre-render API docs to plain Markdown.',
  },
  {
    id: 'extension-codehilite-legacy',
    severity: 'info',
    description:
      'The `codehilite` Markdown extension is the legacy Python-Markdown highlighter, superseded by `pymdownx.highlight`. Starlight uses Expressive Code which subsumes both.',
    fix: 'No action required — Expressive Code handles syntax highlighting in the converted project.',
  },
  {
    id: 'plugin-info-subsumed',
    severity: 'info',
    description:
      'Material `info` plugin produces a bug-report ZIP via `mkdocs build --info`. Astro projects use ordinary git-based reproduction.',
    fix: 'No action required.',
  },
  {
    id: 'plugin-offline-no-equivalent',
    severity: 'warning',
    description:
      'Material `offline` plugin builds for `file://` use. Astro has no offline-mode equivalent and uses absolute URLs by default.',
    fix: "If offline browsing is required, configure Astro with relative URLs and serve via local web server. Most offline use cases are addressed by Pagefind's built-in offline indexing.",
    relatedFeatureId: 'plugin-offline',
  },
  {
    id: 'plugin-group-no-equivalent',
    severity: 'info',
    description:
      "Material `group` plugin conditionally enables a sub-list of plugins (`enabled: !ENV CI`). Astro's integration list is configured statically in astro.config.mjs.",
    fix: 'Use `process.env.CI` checks at the top of `astro.config.mjs` to conditionally include integrations.',
  },
  {
    id: 'hook-archetype-detected',
    severity: 'warning',
    description:
      'A Python hook file referenced from `mkdocs.yml` `hooks:` was detected. The converter cannot evaluate Python; the archetype is reported so you know what equivalent to build in the Astro project.',
    fix: "For shortcode-replacement hooks, write a remark plugin or use the converter's `<!-- md:* -->` substitution. For i18n-fallback, Starlight's built-in fallback rendering covers most cases. For title-extraction, the converter's ensure-title transform already runs. For extension-registration / post-build-emission / dynamic-content, port the logic to remark/rehype plugins, content loaders, or Astro endpoints respectively.",
  },
  {
    id: 'hook-file-not-found',
    severity: 'warning',
    description: 'A Python hook file referenced from `mkdocs.yml` `hooks:` could not be read.',
    fix: 'Verify the path, or remove the hook entry from mkdocs.yml.',
  },
  {
    id: 'extension-md-shortcode-found',
    severity: 'info',
    description:
      'A Material `<!-- md:* -->` shortcode (e.g. `<!-- md:version 1.2 -->`, `<!-- md:flag experimental -->`) was found in source. The converter promotes each shortcode to a Starlight `<Badge>` JSX component and the file is auto-promoted to `.mdx`.',
    fix: 'No action required — the emitted `<Badge text="..." variant="..." />` renders the same intent as the Material badge. Verify the variant choice (note/tip/caution/danger/success/default) matches your visual expectation; tweak inline if needed.',
  },
  {
    id: 'extension-only-mkdocs-stripped',
    severity: 'info',
    description:
      'A `<!-- only-mkdocs -->` … `<!-- /only-mkdocs -->` content block was found and stripped from output (a convention used by some projects to mark content that should appear on the docs site but not in the PyPI README).',
    fix: 'No action required if the content was only meant for the rendered site. Inspect the diff if you wanted to keep the content.',
  },
  {
    id: 'frontmatter-hide-translated',
    severity: 'info',
    description:
      'Frontmatter `hide:` array translated to Starlight equivalents (toc → `tableOfContents: false`, navigation → `template: splash`). `hide: footer` has no Starlight equivalent and is dropped.',
    fix: 'For `hide: footer`, override the Starlight `Footer` component in your Starlight config.',
  },
  {
    id: 'feature-tabs-link-detected',
    severity: 'info',
    description:
      'Material `content.tabs.link` feature (cross-page tab synchronization) detected. Starlight `<Tabs>` accepts a `syncKey` prop for the same behavior — tabs sharing a `syncKey` value sync selection across the whole site, persisted via localStorage.',
    fix: 'Migration anchor: derive a stable `syncKey` from the tab labels (e.g., a sorted-label hash). The converter\'s `package-managers-tabs` mapping already does this for the npm/yarn/pnpm/bun pattern (`syncKey="pkg"`). For other recurring tab-label sets, add the same convention manually: `<Tabs syncKey="env">` for prod/staging/dev, etc. See https://starlight.astro.build/components/tabs/#synchronizing-tabs.',
  },
  {
    id: 'feature-tabs-link-occurrence',
    severity: 'info',
    description:
      'A `=== "Tab"` content-tab block in a source file is affected by `content.tabs.link`. Each such file will get `<Tabs syncKey="…">` components in the output.',
    fix: 'No action required. Verify the emitted `syncKey` attribute on `<Tabs>` in the output file.',
  },
  {
    id: 'extension-codehilite-linenums-occurrence',
    severity: 'info',
    description:
      'A fenced code block with `linenums` option was found in a source file while `codehilite` (linenums: true) is enabled. Expressive Code renders line numbers natively.',
    fix: 'No action required. Expressive Code in Starlight handles `linenums` automatically via the `showLineNumbers` frame option.',
  },
  {
    id: 'plugin-meta-config-detected',
    severity: 'warning',
    description:
      'A `.meta.yml` file was found in the docs directory. The Material `meta` plugin applies frontmatter from these files recursively; Starlight has no equivalent folder-scoped frontmatter cascade.',
    fix: 'Inline the frontmatter from each `.meta.yml` into every affected page, or implement a custom remark plugin that reads `.meta.yml` files and applies their values to the page frontmatter.',
  },
  {
    id: 'feature-navigation-tabs-recommend-topics',
    severity: 'info',
    description:
      'Material `navigation.tabs` (top-level sections as header tabs) detected. The closest Starlight analogue is `starlight-sidebar-topics`.',
    fix: 'Install `starlight-sidebar-topics` and split the generated sidebar into one topic per top-level group.',
  },
  {
    id: 'plugin-macros-detected',
    severity: 'warning',
    description:
      'mkdocs.yml lists `mkdocs-macros-plugin` (Jinja2 expressions in Markdown). The converter cannot evaluate Jinja2; per-file `{{ ... }}` and `{% ... %}` occurrences are reported in MIGRATION_NOTES with line numbers.',
    fix: "Inline the macro values manually, or replace Jinja2 with Astro's frontmatter + custom components. The converter scans for and reports every occurrence so you can find them quickly.",
  },
  {
    id: 'plugin-macros-occurrence',
    severity: 'warning',
    description:
      'A `{{ ... }}` or `{% ... %}` Jinja2 expression was found in a source file. The converter does not evaluate Jinja2; the expression is left in place in the output.',
    fix: 'Replace the expression with literal Markdown, or with an Astro component that produces equivalent content. Astro will not interpret the braces, so they appear verbatim in the rendered page.',
  },
  {
    id: 'yaml-python-tag-stripped',
    severity: 'info',
    description:
      'A PyYAML `!!python/name:` or `!!python/object/apply:` tag was stripped from mkdocs.yml before decode. The Python callable cannot be reproduced in the Astro project.',
    fix: "No action required if the tag selected the standard Material emoji index, slugifier, or fence_code_format — these are subsumed by the converter's defaults. For custom Python callables, replicate the behavior in a remark/rehype plugin or content loader.",
  },
  {
    id: 'mdx-promotion',
    severity: 'info',
    description:
      'Source file was promoted to `.mdx` because it contains ESM imports, JSX components, or frontmatter expressions that the Markdown parser cannot handle. Required Starlight built-in imports were injected automatically.',
    fix: 'No action required. Verify the generated import line at the top of the file matches the components actually used; remove or rename if needed.',
  },
  {
    id: 'logo-source-missing',
    severity: 'warning',
    description:
      'theme.logo path was set in mkdocs.yml but the file could not be found under docs_dir. The Starlight project still references the expected path; add the asset before building.',
    fix: 'Place the logo file at the path declared in mkdocs.yml relative to docs_dir, OR remove the `theme.logo` setting and the corresponding `logo:` block from astro.config.mjs.',
  },
  {
    id: 'favicon-source-missing',
    severity: 'warning',
    description:
      'theme.favicon path was set in mkdocs.yml but the file could not be found under docs_dir.',
    fix: 'Place the favicon at the path declared in mkdocs.yml relative to docs_dir, OR remove the `favicon:` setting from astro.config.mjs.',
  },
  {
    id: 'favicon-extension-unsupported',
    severity: 'warning',
    description:
      'theme.favicon path used a file extension Starlight does not accept. Starlight\'s schema only allows `.ico`, `.gif`, `.jpg`/`.jpeg`, `.png`, and `.svg` favicons; emitting any other extension (e.g. `.webp`, `.avif`) crashes `astro:config:setup` with "favicon must be a .ico, .gif, .jpg, .png, or .svg file". The converter dropped the favicon emission so the build succeeds — Starlight falls back to its default chrome.',
    fix: 'Re-encode the source favicon to one of the accepted formats (PNG is the safest choice for general use; SVG for vector logos) and put it back at the same path under docs_dir, then re-run the converter. As a quicker workaround, drop the `favicon:` setting from mkdocs.yml entirely and Starlight will use its built-in default.',
  },
  {
    id: 'palette-translated',
    severity: 'info',
    description:
      'Material `theme.palette.primary` color was translated into Starlight accent CSS variables in the generated stylesheet shim.',
    fix: 'No action required. The closest Starlight accent hue is approximate; tune `--sl-color-accent-*` in `src/styles/mkdocs-migration.css` if needed. See https://starlight.astro.build/guides/css-and-tailwind/#theming for the full accent-ramp reference.',
    relatedFeatureId: 'theme-palette',
  },
  {
    id: 'palette-custom-needs-manual',
    severity: 'warning',
    description:
      'Material `theme.palette.primary: custom` was detected. The custom palette relies on user-defined `--md-primary-fg-color` overrides which the converter cannot read.',
    fix: "Inspect your existing `extra_css` files for `--md-primary-fg-color` declarations and translate them to Starlight's `--sl-color-accent-*` ramp in `src/styles/mkdocs-migration.css`. See https://starlight.astro.build/guides/css-and-tailwind/#theming for the canonical CSS variable list.",
    relatedFeatureId: 'theme-palette',
  },
  {
    id: 'palette-unknown-color',
    severity: 'warning',
    description:
      'Material `theme.palette.primary` named a color the converter does not recognize. The Starlight project will use the default accent.',
    fix: "Pick one of Material's 21 named colors, or set `--sl-color-accent-*` directly in `src/styles/mkdocs-migration.css`.",
    relatedFeatureId: 'theme-palette',
  },
  {
    id: 'visual-diff-mismatch',
    severity: 'warning',
    description:
      'A page rendered visually different between the baseline (MkDocs) and converted (Starlight) sites by more than the configured threshold.',
    fix: 'Open both URLs side-by-side and identify the visual delta. Common causes: missing custom CSS, theme color drift, plugin output the converter dropped, font-loading differences.',
  },
  {
    id: 'visual-diff-capture-failed',
    severity: 'error',
    description:
      'A page screenshot could not be captured during visual diff (browser navigation timed out, URL unreachable, or driver missing).',
    fix: 'Verify both sites are running and reachable. Install Playwright with `npm install playwright && npx playwright install chromium` if the driver is missing.',
  },
  {
    id: 'visual-diff-image-failed',
    severity: 'error',
    description:
      'Two pages were captured but the image diff itself failed (PNG decode error, dimension mismatch, or driver missing).',
    fix: 'Ensure both sites render at the same viewport size. Install pixelmatch and pngjs with `npm install pixelmatch pngjs` if the driver is missing.',
  },
  {
    id: 'plugin-rss-applied',
    severity: 'info',
    description:
      'mkdocs-rss-plugin detected — `@astrojs/rss` was added to dependencies and `src/pages/rss.xml.ts` was scaffolded against the `docs` content collection.',
    fix: 'Review the generated endpoint and adjust `description`, `link`, or `pubDate` mappings to match your frontmatter conventions. The mkdocs-rss-plugin `feed_meta`, `length`, and `comments` options are not honored — set them inside the rss() call manually.',
    relatedFeatureId: 'plugin-rss',
  },
  {
    id: 'plugin-include-markdown-applied',
    severity: 'info',
    description:
      'mkdocs-include-markdown-plugin detected — `{% include %}` and `{% include-markdown %}` directives have been resolved inline against the docs directory.',
    fix: 'No action required. The expander runs before per-file conversion so the resulting Markdown contains the inlined content directly. Verify no directives remain in the output.',
  },
  {
    id: 'plugin-include-markdown-not-found',
    severity: 'warning',
    description:
      'A `{% include %}` directive references a file that could not be resolved against the docs directory.',
    fix: 'Verify the relative path. The directive is left in place verbatim so the source remains valid Markdown.',
  },
  {
    id: 'plugin-include-markdown-marker-not-found',
    severity: 'warning',
    description:
      'A `{% include-markdown %}` directive used a `start=` or `end=` marker that was not present in the resolved file.',
    fix: 'Add matching marker comments to the included file or correct the marker text in the directive.',
  },
  {
    id: 'plugin-include-markdown-unsupported-option',
    severity: 'warning',
    description:
      'A `{% include-markdown %}` directive uses an option that the converter does not honor (heading-offset, dedent, rewrite-relative-urls, comments, preserve-includer-indent, trailing-newlines).',
    fix: 'Inline the desired transformation manually after expansion. The file content is still inserted, but the option is silently ignored.',
  },
  {
    id: 'plugin-literate-nav-applied',
    severity: 'info',
    description:
      "mkdocs-literate-nav detected — the project's SUMMARY.md (or configured nav file) was parsed as the navigation source and used to build the Starlight sidebar.",
    fix: 'No action required. The literate-nav file replaces any `nav:` block in mkdocs.yml. Review the generated sidebar in astro.config.mjs to confirm the structure looks right.',
  },
  {
    id: 'plugin-literate-nav-no-summary',
    severity: 'warning',
    description:
      'mkdocs-literate-nav is enabled but no top-level SUMMARY.md (or configured nav file) was found in the docs directory.',
    fix: 'Add a SUMMARY.md (or whatever the literate-nav `nav_file:` option points at) to your docs directory, or remove the literate-nav plugin from mkdocs.yml.',
  },
  {
    id: 'plugin-literate-nav-malformed',
    severity: 'warning',
    description:
      'A list item in the literate-nav SUMMARY.md could not be parsed as a recognizable nav entry (no link, no nested list, and no plain text label).',
    fix: 'Edit the SUMMARY.md to ensure each list item is either `[Label](path.md)`, an external link, or a label followed by a nested indented list of children.',
  },
  {
    id: 'plugin-section-index-applied',
    severity: 'info',
    description:
      'mkdocs-section-index detected — sections containing an `index.md` (or `README.md`) child have been reordered so the index page appears first in the Starlight sidebar group.',
    fix: "No action required. Note: Starlight does not support clickable group labels the way mkdocs-section-index does in MkDocs. The index page is hoisted to the top of its group instead. If a section's index page is missing from the explicit `nav:` block, add it manually — the converter only reorders entries that are already listed.",
  },
  {
    id: 'plugin-i18n-needs-rename',
    severity: 'info',
    description:
      'mkdocs.yml lists the `i18n` plugin (mkdocs-static-i18n); per-locale files have been renamed automatically.',
    fix: 'Add a `locales: { … }` block to `astro.config.mjs` to register each locale with Starlight (the converter renames source files but does not write the locale config). See https://starlight.astro.build/guides/i18n/ for the `locales` config schema and translation patterns.',
    relatedFeatureId: 'plugin-i18n-rename',
  },
  {
    id: 'theme-fonts-applied',
    severity: 'info',
    description:
      '`theme.font.text` and/or `theme.font.code` detected — `@fontsource-variable/<family>` added to package.json and `--sl-font` / `--sl-font-mono` overrides written to `src/styles/custom.css`.',
    fix: 'Run `npm install` to fetch the font package. If the requested family is not on Fontsource, the converter falls back to the closest variable font and a diagnostic surfaces the substitution — replace the import manually with a self-hosted file or a different provider.',
    relatedFeatureId: 'theme-fonts',
  },
  {
    id: 'theme-language-applied',
    severity: 'info',
    description:
      '`theme.language` detected — Starlight `defaultLocale` and `locales: { root: { label, lang } }` set in astro.config.mjs.',
    fix: "No action required for locales Starlight ships translations for (the same set Material supports). For an unsupported locale, add UI strings via Starlight's `i18n` config: https://starlight.astro.build/guides/i18n/#translate-starlights-ui.",
    relatedFeatureId: 'theme-language',
  },
  {
    id: 'theme-logo-icons-applied',
    severity: 'info',
    description:
      '`theme.logo` and/or `theme.favicon` detected — assets copied and wired into the starlight `logo` and `head` config.',
    fix: 'Verify the logo renders at the expected size (Starlight scales differently than Material). The repo icon is honored via the `social` config. For the rest: `starlight-plugin-icons` covers sidebar, codeblock, and filetree icon customization (install manually if you used `theme.icon` for nav icons). Admonition / page-action icon overrides remain unmapped and require Starlight component overrides (`Aside.astro`, `PageActions.astro`).',
    relatedFeatureId: 'theme-logo-icons',
  },
  {
    id: 'theme-feature-replaced',
    severity: 'info',
    description:
      'A `theme.features` entry maps to a Starlight default-on behavior or to bundled tooling (Pagefind, ExpressiveCode). The feature is acknowledged and no config change is needed.',
    fix: 'No action required. The diagnostic message lists the specific feature and the Starlight surface that already provides it.',
    relatedFeatureId: 'theme-features',
  },
  {
    id: 'theme-feature-unsupported',
    severity: 'warning',
    description:
      'A `theme.features` entry has no first-class Starlight equivalent and was dropped (e.g., toc.integrate, navigation.prune, header.autohide, search.share, navigation.top, navigation.expand). Note: `announce.dismiss` and `content.action.view` ARE covered now via `starlight-announcement` and `starlight-page-actions` respectively (auto-installed when detected).',
    fix: 'Migration anchors per feature: (a) `navigation.instant.*` (XHR navigation, prefetch, progress) → Astro\'s `<ClientRouter />` from `astro:transitions` provides view-transition-style nav with prefetch hints. (b) `navigation.tracking` (URL anchor sync on scroll) → custom client script in `Head.astro` listening to `IntersectionObserver`. (c) `navigation.prune` (HTML reduction) → no equivalent; ignore. (d) `toc.integrate` / `toc.follow` → override `TableOfContents.astro` and merge into `Sidebar.astro`. (e) `header.autohide` → override `Header.astro` with a scroll-listener that toggles a `--sl-nav-translate` CSS var. (f) `search.share` → override `Search.astro` to add a "copy link to query" button. The full overrides reference is at https://starlight.astro.build/reference/overrides/.',
    relatedFeatureId: 'theme-features',
  },
  {
    id: 'theme-feature-unknown',
    severity: 'warning',
    description:
      'A `theme.features` entry was not recognized as a Material feature flag — likely a typo or a flag added to Material after this converter was last refreshed.',
    fix: 'Check https://squidfunk.github.io/mkdocs-material/setup/setting-up-navigation/ for the current list of supported flags. If it is a real flag, file an issue against this converter so it can be added to the catalog.',
    relatedFeatureId: 'theme-features',
  },
  {
    id: 'plugin-search-replaced',
    severity: 'info',
    description:
      "Material/MkDocs `search` plugin detected — replaced by Starlight's built-in Pagefind search. Lunr-specific options (`search.lang`, `search.separator`, `search.pipeline`) are dropped.",
    fix: 'No action required for typical sites. To customize tokenization or non-Latin script segmentation, configure Pagefind via the starlight `pagefind` config option or the Pagefind UI options in your build.',
    relatedFeatureId: 'plugin-search',
  },
  {
    id: 'extra-analytics-applied',
    severity: 'info',
    description:
      '`extra.analytics` detected — Google Analytics loader and inline gtag() initializer were injected into the starlight `head` config.',
    fix: 'Verify the rendered property ID in astro.config.mjs matches what you expect to appear at https://analytics.google.com. Only the `google` provider is converted today; `matomo`, `plausible`, and custom providers are not auto-injected.',
    relatedFeatureId: 'extra-analytics',
  },
  {
    id: 'extra-analytics-feedback-dropped',
    severity: 'warning',
    description:
      '`extra.analytics.feedback` (the Material "Was this page helpful?" widget) was dropped — Starlight has no built-in equivalent.',
    fix: 'Migration anchors: (1) **FeelBack** — the recommended community widget listed at https://starlight.astro.build/resources/plugins/ (search "FeelBack"). Install via `<script src="https://cdn.feelback.dev/...">` injected into Starlight `head[]`. (2) Custom Footer override — add a small Astro component that calls `gtag(\'event\', \'feedback\', { rating: ... })` to forward the rating to GA4. (3) Reuse `starlight-page-actions` (already auto-installed when `content.action.view` is enabled) and add a custom action that opens an issue/PR for the page.',
    relatedFeatureId: 'extra-analytics',
  },
  {
    id: 'extra-analytics-provider-unsupported',
    severity: 'warning',
    description:
      'mkdocs.yml `extra.analytics.provider` is a custom or unrecognized value. The converter only auto-wires Google Analytics, and no community Starlight plugin is known for this provider.',
    fix: "Add the provider's tracking snippet directly to your Starlight `head[]` config in `astro.config.mjs`. The converter intentionally does not generate snippets for analytics tools whose terms or scripts may have changed since this release.",
    relatedFeatureId: 'extra-analytics',
  },
  {
    id: 'theme-header-applied',
    severity: 'info',
    description:
      'Header surface keys detected (announce/repo_url/edit_uri) — converted to starlight `banner`, `social`, and `editLink` config respectively.',
    fix: 'Verify the announcement banner renders at the top of every page and the repo icon links to the right URL. `announce.dismiss` and `header.autohide` are dropped — they have no Starlight equivalent. Reimplement via a custom `Header.astro` component override if needed.',
    relatedFeatureId: 'theme-header',
  },
  {
    id: 'theme-footer-applied',
    severity: 'info',
    description:
      '`extra.social` and/or `copyright` detected — social links wired into starlight `social` config; copyright text emitted into a `Footer.astro` component override.',
    fix: 'Verify the Footer component override is registered in starlight `components: { Footer: "./src/components/overrides/Footer.astro" }`. `extra.consent` (cookie consent dialog) is dropped — install a third-party consent manager (e.g., `cookieconsent`) and wire it into the starlight `head` config.',
    relatedFeatureId: 'theme-footer',
  },
  {
    id: 'comment-system-recommendation',
    severity: 'info',
    description:
      'A comment-system override was detected in overrides/ (Giscus, Disqus, or Utterances snippet). The Material partial-override HTML is not auto-converted — Starlight uses a different override surface.',
    fix: 'Install a community Starlight plugin ([starlight-giscus](https://github.com/dragomano/starlight-giscus) for GitHub Discussions, or write a `Comments.astro` component override registered via the starlight `components` config). Port the snippet from your overrides/ HTML by hand — repo IDs and theme settings carry over unchanged.',
    relatedFeatureId: 'comment-system',
  },
  {
    id: 'expressive-code-theme-applied',
    severity: 'info',
    description:
      '`pymdownx.highlight.pygments_style` was mapped to a Starlight `expressiveCode: { themes: [light, dark] }` pair using the curated Pygments→Shiki table.',
    fix: "No action required. If the visual result differs from your MkDocs site, replace the theme identifiers in astro.config.mjs with any other Shiki theme — see https://expressive-code.com/themes/ for the full catalog. Both a light and a dark theme must be provided for Starlight's theme switcher to work.",
    relatedFeatureId: 'expressive-code-theme',
  },
  {
    id: 'expressive-code-theme-fallback',
    severity: 'warning',
    description:
      '`pymdownx.highlight.pygments_style` named a Pygments style with no curated Shiki equivalent. The default `[github-light, github-dark]` pair was used.',
    fix: 'Pick a Shiki theme that visually matches your previous Pygments style and replace the `expressiveCode.themes` value in astro.config.mjs. The Shiki theme catalog (https://shiki.style/themes) is broader than Pygments but uses different identifiers — there is no algorithmic 1:1 mapping for less common styles.',
    relatedFeatureId: 'expressive-code-theme',
  },
  {
    id: 'expressive-code-options-dropped',
    severity: 'warning',
    description:
      'One or more `pymdownx.highlight` options have no ExpressiveCode equivalent and were dropped: linenums, linenums_style, linenums_special, anchor_linenums, line_spans, line_anchors, noclasses, use_pygments, extend_pygments_lang, pygments_lang_class.',
    fix: 'For per-block line numbers, add the `:line-numbers` annotation to individual fenced code blocks. For inline-style highlighting (noclasses), accept that ExpressiveCode always emits class-based markup — it is the recommended approach for theme switching anyway. The remaining options have no straightforward port; reimplement via an ExpressiveCode plugin if needed.',
    relatedFeatureId: 'expressive-code-theme',
  },
  {
    id: 'wizard-decision-applied',
    severity: 'info',
    description:
      'A wizard answer (or equivalent CLI flag) overrode a converter default. Recorded in MIGRATION_NOTES.md so the run is reproducible without re-running the wizard.',
    fix: 'No action required. To restore the default, remove the corresponding flag from the next invocation.',
  },
  {
    id: 'wizard-non-interactive-fallback',
    severity: 'info',
    description:
      'The wizard was skipped because stdout/stdin are not TTYs (or --no-interactive / --ci was passed) and `--yes` was not provided.',
    fix: 'Pass `--yes` to accept defaults non-interactively, or run from a TTY to use the wizard.',
  },
  {
    id: 'wizard-cancelled',
    severity: 'info',
    description: 'The user cancelled the wizard (Ctrl+C). No conversion was performed.',
    fix: 'Re-run the wizard, or invoke with explicit flags + `--yes` to skip prompts.',
  },
  {
    id: 'source-include-directive-detected',
    severity: 'info',
    description:
      'A `{* path *}` source-include directive was found. The converter cannot run the MkDocs macros plugin to inline the file; a TODO comment with the path is emitted instead.',
    fix: "Manually inline the referenced file's contents at the marked location, or write an Astro component / remark plugin that reads the file at build time.",
  },
  {
    id: 'macros-expression-detected',
    severity: 'info',
    description:
      'A Jinja2/macros expression `{{ ... }}` was found in a source file outside a code block. The macros plugin runtime is not reproducible by the converter.',
    fix: 'Replace the expression with literal Markdown or an Astro component that produces equivalent content.',
  },
  {
    id: 'heading-explicit-id-stripped',
    severity: 'info',
    description:
      'An explicit heading ID (`{#slug}`) was stripped. Cross-page deep links to `#slug` will not resolve in Starlight.',
    fix: 'Re-add the anchor as an inline anchor `<a id="slug"></a>` next to the heading, or use `--keep-explicit-heading-ids` (deferred to v2).',
  },
  {
    id: 'mkdocstrings-cross-ref-stripped',
    severity: 'info',
    description:
      'A mkdocstrings cross-reference (`` [`X`][] `` or `` [`X`][module.Path] ``) was reduced to inline code. The Python autodoc target cannot be resolved by Starlight.',
    fix: 'If the cross-reference should link to an API page, manually add the appropriate URL after conversion.',
  },
  {
    id: 'link-attr-list-stripped',
    severity: 'info',
    description:
      'A `{.class attr=value}` link attribute list following an inline link was stripped. Starlight has no equivalent HTML attribute syntax for Markdown links.',
    fix: 'Re-add the desired attributes as MDX `<a>` props if needed, or use an Astro component.',
  },
  {
    id: 'block-attr-list-stripped',
    severity: 'info',
    description:
      'A bare PyMdown `attr_list` line (e.g., `{ .card }` or `{ #id style="..." }`) decorating the previous block was stripped during MDX promotion. Starlight has no equivalent post-MDX attribute hook, and MDX itself parses the bare `{...}` as a JS expression — which fails on `.class`/CSS-shaped contents.',
    fix: 'Re-attach the desired classes or attributes as JSX props on the preceding element. Pure heading-anchor `{#id}` lines are not stripped; they remain visibly escaped so the user can re-anchor them manually.',
  },
  {
    id: 'inline-attr-list-stripped',
    severity: 'info',
    description:
      'An inline PyMdown `attr_list` block (e.g., `:icon[name]{ .lg .middle }` or `:material-clock-fast:{ .lg }`) was stripped during MDX promotion. MDX would otherwise try to acorn-parse `.lg .middle` as JavaScript and crash. Only `{...}` whose tokens are all attr-list shape (with at least one `.class` or `key=value`) are stripped — real JSX expressions like `{user.name}` are left alone.',
    fix: 'Re-attach the desired attributes as JSX props on the preceding component or wrap the content in an Astro component that accepts the equivalent props.',
  },
  {
    id: 'heading-span-anchor-stripped',
    severity: 'info',
    description:
      'A manual heading anchor `<span id="..."> Title` (Material idiom — and sometimes paragraph-level too) was stripped during MDX promotion. MDX rejects unmatched `<span>` openers and Starlight derives heading anchors from the heading text, not from a manual `id`. Each stripped `id` is reported separately so the user sees every dropped cross-page link target.',
    fix: 'If cross-page links target `#anchor`, re-add the anchor inside the heading body as `<a id="anchor"></a>` (the file becomes `.mdx`), or update the linking pages to use Starlight\'s auto-generated heading slug (derived from the heading text).',
  },
  {
    id: 'package-managers-tabs-promoted',
    severity: 'info',
    description:
      'A tab group using npm/yarn/pnpm/bun as tab labels was detected and promoted to a `<PackageManagers>` component from the `starlight-package-managers` package.',
    fix: 'No action required. Verify the `pkg` prop on the emitted `<PackageManagers>` component is correct. Install `starlight-package-managers` (`npm install starlight-package-managers`) and wire it into your Astro config if not already done.',
    relatedFeatureId: 'package-managers-tabs',
  },
  {
    id: 'package-managers-tabs-fallback',
    severity: 'warning',
    description:
      'A package-manager tab group was detected but the package name could not be extracted from the install command. The converter falls back to a plain `<Tabs>` instead of `<PackageManagers>`, which loses the cross-page tab synchronization users expect.',
    fix: 'Edit the affected file to either (a) make the install command match `<pm> install <package-name>` so the converter can extract the name on the next run, or (b) hand-replace the `<Tabs>` block with `<PackageManagers pkg="your-package">`.',
    relatedFeatureId: 'package-managers-tabs',
  },
  {
    id: 'plugin-swagger-ui-mapped',
    severity: 'info',
    description:
      'mkdocs.yml lists `mkdocs-swagger-ui-tag` which has a Starlight equivalent: `starlight-openapi`.',
    fix: 'Install `starlight-openapi` and add it to your Astro Starlight integration. See https://starlight-openapi.vercel.app for setup. Each `<swagger-ui>` tag in source must be manually replaced with the appropriate Starlight Openapi component or page route.',
    relatedFeatureId: 'plugin-swagger-ui',
  },
  {
    id: 'plugin-social-mapped',
    severity: 'info',
    description:
      "mkdocs.yml lists Material's `social` plugin (per-page Open Graph card PNGs). No `starlight-*` plugin exists for this; the canonical Starlight pattern uses `astro-og-canvas`. Distinct from Starlight's `social: []` config (header social-media icon links).",
    fix: 'The converter has installed `astro-og-canvas` and emitted a stub endpoint at `src/pages/og/[...slug].png.ts`. Run `npm install`, then customize the card layout (logo, fonts, colors, padding) — see https://github.com/delucis/astro-og-canvas#options. Optionally inject `<meta property="og:image">` per-page via Starlight\'s `head[]` config.',
    relatedFeatureId: 'plugin-social',
  },
  {
    id: 'theme-feature-longtail-detected',
    severity: 'info',
    description:
      'A `theme.features` flag was detected that has a known Starlight approximation but is not automatically converted. The diagnostic message includes the recommended Starlight config snippet or component override path.',
    fix: 'Follow the recommendation in the diagnostic message to approximate the Material behavior in your Starlight project.',
    relatedFeatureId: 'theme-features',
  },
  {
    id: 'landing-page-promoted',
    severity: 'info',
    description:
      "The root `index.md` was detected as a landing-style page (hero image + CTA buttons or feature grid) and its frontmatter was rewritten to use Starlight's `template: splash` with a `hero:` block.",
    fix: 'No action required. Review the generated `hero:` frontmatter in the output `index.md` and adjust `title`, `tagline`, `image`, and `actions` to match your design intent. See https://starlight.astro.build/reference/frontmatter/#hero for the full hero schema. The original body content (including any feature grid) is preserved below the hero block.',
    relatedFeatureId: 'landing-page-splash',
  },
  {
    id: 'code-fence-promoted-to-filetree',
    severity: 'info',
    description:
      'A fenced code block containing an ASCII directory tree (box-drawing characters ├/└/│) was promoted to a `<FileTree>` component.',
    fix: 'No action required. Verify the emitted `<FileTree>` block renders correctly. The file has been promoted to `.mdx` to support the JSX component.',
    relatedFeatureId: 'code-fence-filetree',
  },
  {
    id: 'ordered-list-promoted-to-steps',
    severity: 'info',
    description:
      'A top-level ordered list that meets the tutorial-step heuristic (≥3 items, each multi-line, preceded by a tutorial-style heading) was promoted to a `<Steps>` component.',
    fix: 'No action required. Verify the emitted `<Steps>` block renders correctly in your Starlight project. The file has been promoted to `.mdx` to support the JSX component.',
    relatedFeatureId: 'ordered-list-steps',
  },
  {
    id: 'grid-card-promoted-to-linkcard',
    severity: 'info',
    description:
      "A grid card whose body was a single navigation link (optionally followed by a single plain-prose paragraph) was promoted to a `<LinkCard>` component. The link becomes the title/href; a trailing paragraph, when present and free of inline markup, becomes the `description=` attribute. This maps cleanly to Starlight's native `<LinkCard>` and avoids a generic `:::card` directive wrapper.",
    fix: 'No action required. Verify the emitted `<LinkCard>` title, href, and (when present) description are correct. The file has been promoted to `.mdx` to support the JSX component.',
    relatedFeatureId: 'grid-cards-linkcard',
  },
  {
    id: 'md-button-promoted-to-linkbutton',
    severity: 'info',
    description:
      'A Material `[label](url){ .md-button }` link was promoted to Starlight\'s `<LinkButton>` component. `.md-button` maps to `variant="secondary"`; `.md-button .md-button--primary` maps to `variant="primary"`. Resolvable inline icon shortcodes (e.g. `:material-rocket:`) become the `icon=` prop. The file is promoted to `.mdx` to support the JSX component.',
    fix: 'No action required. Verify the emitted `<LinkButton>` href, variant, label, and (when present) icon are correct. If the original `.md-button--*` modifier was a project-specific variant (not the canonical `.md-button--primary`), choose between `variant="primary"`, `"secondary"`, and `"minimal"` manually.',
    relatedFeatureId: 'buttons',
  },
  {
    id: 'extension-arithmatex-detected',
    severity: 'warning',
    description:
      '`pymdownx.arithmatex` was configured. The converter passes `$inline$` and `$$block$$` math through to remark-math, but Astro needs a rehype renderer to actually display the formulas.',
    fix: 'Install `rehype-katex` (preferred for static rendering) or `rehype-mathjax`, then add it to the markdown integrations in `astro.config.mjs`: `markdown: { remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }`. Also add `import "katex/dist/katex.min.css"` to your global CSS. Full setup: https://docs.astro.build/en/guides/markdown-content/#markdown-plugins and https://github.com/remarkjs/remark-math.',
  },
  {
    id: 'latex-delimiter-unsupported',
    severity: 'warning',
    description:
      "Source uses Material's alternate LaTeX delimiters `\\(...\\)` (inline) or `\\[...\\]` (block), which Material recommends as a MathJax-friendly alternative to `$`/`$$`. remark-math (the math pipeline auto-wired into emitted Starlight projects) does not recognize backslash-paren delimiters by default, so they will pass through verbatim and render as literal backslashes.",
    fix: 'Easiest path: rewrite to dollar delimiters in source. `\\(x\\)` becomes `$x$`; `\\[y\\]` becomes `$$y$$`. Alternative: configure a custom remark plugin in `astro.config.mjs` that recognizes backslash delimiters (e.g., a Pandoc-flavored math plugin), or write a small regex-based remark plugin to translate the delimiters before remark-math runs. See https://github.com/remarkjs/remark-math/tree/main/packages/remark-math for the package README and API reference.',
  },
  {
    id: 'math-runtime-script-superseded',
    severity: 'info',
    description:
      'An `extra_javascript` entry references a MathJax or KaTeX runtime configuration script. Material loads these at runtime to render math in the browser, but Astro renders math at build time via remark-math + rehype-katex (auto-wired when `pymdownx.arithmatex` is detected), making the runtime script redundant and potentially conflicting with the rehype output.',
    fix: "Remove the script entry from your Astro config's `head[]` after confirming math still renders. The original script file is still copied through to `public/` for inspection but is no longer referenced.",
  },
  {
    id: 'extension-progressbar-no-equivalent',
    severity: 'warning',
    description:
      '`pymdownx.progressbar` was configured. The `[=85% "label"]` progress-bar syntax has no Starlight or Astro equivalent and will pass through as literal text.',
    fix: 'Replace progress-bar markers with a custom Astro component, an inline `<progress>` element, or static text. There is no first-class Starlight component for progress bars.',
  },
  {
    id: 'extension-striphtml-subsumed',
    severity: 'info',
    description:
      '`pymdownx.striphtml` was configured. This MkDocs build-time HTML stripper has no role in the Astro pipeline; MDX/Astro handle HTML inclusion through their own component model.',
    fix: 'No action required. Remove the extension entry from your migration notes — the behavior is subsumed.',
  },
  {
    id: 'extension-blocks-dialog-no-equivalent',
    severity: 'warning',
    description:
      '`pymdownx.blocks.dialog` was configured. The `/// dialog | …` block syntax has no Starlight equivalent and will pass through unchanged.',
    fix: 'Replace dialog blocks with a custom MDX component (e.g., `<Dialog>`) defined under `src/components/`, or convert them to plain admonitions/asides. There is no first-class Starlight component for dialog wrappers.',
  },
  {
    id: 'extension-blocks-grid-no-equivalent',
    severity: 'warning',
    description:
      '`pymdownx.blocks.grid` was configured. This is the generic CSS-grid block (distinct from `grid cards`) and has no Starlight equivalent.',
    fix: 'Replace grid blocks with hand-written `<div class="sl-grid">` markup using the migration CSS shim, or wrap content in a custom Astro component. The `<div class="grid cards">` shape IS still mapped — only the bare `pymdownx.blocks.grid` form is unmapped.',
  },
  {
    id: 'extension-escapeall-detected',
    severity: 'info',
    description:
      '`pymdownx.escapeall` was configured. MDX and remark already handle backslash escapes natively; some character escapes that Python-Markdown allowed may behave differently in MDX.',
    fix: 'No automatic action. Spot-check passages that rely on escaping unusual characters (e.g., `\\!`, `\\(`) — MDX may treat some of them as JSX or directive syntax. Common cases (`\\*`, `\\_`, `\\\\`) still work.',
  },
  {
    id: 'extension-pathconverter-subsumed',
    severity: 'info',
    description:
      "`pymdownx.pathconverter` was configured. The converter's built-in link normalizer rewrites `.md` paths to Starlight slugs, which subsumes pathconverter's job.",
    fix: "No action required. Remove the extension entry from your migration notes — the behavior is subsumed by the converter's slug-map step.",
  },
  {
    id: 'extension-saneheaders-detected',
    severity: 'info',
    description:
      '`pymdownx.saneheaders` was configured. This extension restricts `#heading` parsing in inline contexts. Remark/MDX heading parsing follows CommonMark defaults, which approximate but do not exactly match saneheaders behavior.',
    fix: "No automatic action. Headings that worked under saneheaders should continue to work; spot-check files where you intentionally relied on saneheaders' stricter parsing of `#` in mid-line contexts.",
  },
  {
    id: 'material-insiders-feature-detected',
    severity: 'info',
    description:
      'A Material for MkDocs *Insiders* feature was detected in `mkdocs.yml`. Insiders features are paid and not part of public Material — the open-source converter cannot reproduce them. Configs commonly drift between Insiders and non-Insiders sites because they are forked from public templates.',
    fix: 'Read the diagnostic message — each Insiders feature includes the closest Starlight or Astro approximation. If your site is not actually built with Insiders, remove the feature/plugin entry from `mkdocs.yml`. If it is, plan a manual port of the affected behavior.',
  },
  {
    id: 'plugin-pdf-export-mapped',
    severity: 'info',
    description:
      '`mkdocs-pdf-export-plugin` (or its variant `mkdocs-with-pdf`) was configured. PDF export is not available as an Astro integration, but `starlight-to-pdf` is a CLI tool that runs against the built Starlight site to produce equivalent PDFs.',
    fix: 'Install the CLI manually: `npm i -D starlight-to-pdf`, then run `npx starlight-to-pdf <site-url>` after each `astro build`. Wire it into your CI release step if you publish PDFs alongside web docs. The converter does not auto-install CLI tools (only Astro integrations).',
  },
  {
    id: 'plugin-exclude-mapped',
    severity: 'info',
    description:
      '`mkdocs-exclude` was configured. The converter filters matching source files (glob + regex) out of the conversion before they become Starlight pages.',
    fix: "No action required — filtering happens automatically. Remove the plugin block from the converted project's configuration; pages excluded at the source step are never written to `src/content/docs/`.",
  },
  {
    id: 'plugin-git-authors-mapped',
    severity: 'info',
    description:
      '`mkdocs-git-authors-plugin` or `mkdocs-git-committers-2` was configured. Both add per-page contributor metadata derived from `git log`. Starlight has no first-class per-page author/contributor block.',
    fix: 'For project-wide contributor display, install the `starlight-contributor-list` community plugin (a single footer block of all repo contributors). For true per-page authors, write a small Astro component that runs `git log --format=%an --follow <file>` at build time and renders the result in the page footer via a component override. The converter does not auto-install either path because both require project-specific styling decisions.',
  },
  {
    id: 'plugin-mkdocs-bibtex-no-equivalent',
    severity: 'warning',
    description:
      '`mkdocs-bibtex` was configured. The plugin reads a `.bib` file and renders citations + bibliography pages. Starlight has no built-in citation system.',
    fix: 'Pre-render citations to inline footnotes ahead of conversion (e.g. with Pandoc), or write a custom remark plugin that reads your `.bib` file and inlines `[@key]` references as footnotes. The converter does not auto-install a BibTeX pipeline.',
  },
  {
    id: 'extra-consent-no-equivalent',
    severity: 'warning',
    description:
      "mkdocs.yml `extra.consent` (Material's cookie consent dialog) was detected. Starlight has no built-in consent manager and does not auto-translate consent block configuration.",
    fix: 'Install a third-party library such as `vanilla-cookieconsent` or `klaro`, configure it in a small Astro component, and wire the script into Starlight `head[]`. Alternatively, use a hosted consent management platform (OneTrust, Cookiebot) and add their snippet via `head[]`.',
  },
  {
    id: 'extra-status-no-equivalent',
    severity: 'info',
    description:
      "mkdocs.yml `extra.status` (Material's per-page lifecycle status name dictionary used with frontmatter `status: <key>`) was detected. Starlight has no equivalent dictionary mechanism.",
    fix: 'Reproduce each status by placing a Starlight `<Badge>` inline next to the page heading in the affected pages (the file becomes `.mdx`). Alternatively, declare a `status` field in the docs frontmatter schema (`docsSchema().extend(...)`) and surface it via a custom PageTitle component override.',
  },
  {
    id: 'tab-anchors-not-preserved',
    severity: 'info',
    description:
      "Material content tabs were detected in a source file. Since pymdown-extensions 9.5.0 (with readable slugs since 9.6.0's `slugify` config), Material auto-generates an anchor link for each tab (e.g. `#linux`). Starlight's `<Tabs>+<TabItem>` has no `id` or anchor prop, so any in-page or cross-page links targeting a tab anchor will resolve to nothing after migration.",
    fix: 'If your docs contain `[link](#tab-label)` references that targeted a specific tab, add a manual `<a id="tab-label" />` element inside the affected `<TabItem>` content (the file is already `.mdx` so JSX works). This restores anchor scrolling but does not activate a hidden tab — that requires client-side script. If no such cross-tab links exist, no action is required.',
  },
  {
    id: 'material-tags-marker-detected',
    severity: 'warning',
    description:
      'A Material `<!-- material/tags -->` index marker (with or without `{ scope, include, exclude, toc }` parameters) was detected in source. Material renders this marker as a list of all tagged pages; Starlight has no equivalent and the marker becomes an inert HTML comment in the converted output.',
    fix: "Install the [starlight-tags](https://github.com/frostybee/starlight-tags) community plugin and replace this marker with its `<TagsList />` JSX component (the file becomes `.mdx`). Per-tag scoping/inclusion/exclusion that Material supports must be reproduced via the plugin's component props.",
  },
  {
    id: 'frontmatter-search-boost',
    severity: 'info',
    description:
      "Page frontmatter `search.boost: <number>` was detected — Material's Lunr per-page rank multiplier. Starlight's default Pagefind has no equivalent frontmatter field.",
    fix: 'Pagefind ranking is configured at the site level via the `pagefind` option in `astro.config` (e.g. `weight`, `sort`), or per-element via `data-pagefind-weight` attributes inside the body. The boost frontmatter is dropped on conversion.',
  },
  {
    id: 'frontmatter-search-exclude',
    severity: 'info',
    description:
      "Page frontmatter `search.exclude: true` was detected — Material's Lunr per-page index exclusion.",
    fix: "Replace the `search: { exclude: true }` block with `pagefind: false` at the frontmatter top level for the same effect under Starlight's default Pagefind. For sub-page exclusion, use `data-pagefind-ignore` attributes inside the body.",
  },
  {
    id: 'frontmatter-blog-categories',
    severity: 'info',
    description:
      "Page frontmatter `categories:` was detected — Material blog plugin's thematic grouping field. `starlight-blog` does not have a separate categories taxonomy.",
    fix: 'Either move category names into the `tags:` array (the converter does not auto-merge to avoid silent data shifts), or accept that `categories:` passes through as opaque YAML. `starlight-blog` only renders `tags:`. See https://github.com/HiDeoo/starlight-blog for the supported frontmatter fields.',
  },
  {
    id: 'frontmatter-blog-pin',
    severity: 'info',
    description:
      "Page frontmatter `pin: true|false` was detected — Material blog plugin's pin-to-top index feature. `starlight-blog` does not honor this field.",
    fix: 'Reproduce by setting `featured: true` on the post (a `starlight-blog` convention surfaced in the sidebar) or by adjusting the post `date` field to control ordering. See https://github.com/HiDeoo/starlight-blog for the supported frontmatter fields.',
  },
  {
    id: 'frontmatter-blog-links',
    severity: 'info',
    description:
      "Page frontmatter `links:` was detected — Material blog plugin's related-reading list rendered in the post sidebar. `starlight-blog` has no equivalent.",
    fix: 'Reproduce by inlining the links inside an "## Related" heading at the foot of the post body, or build a small Astro component that reads a `related:` frontmatter field via `getEntry()`. See https://github.com/HiDeoo/starlight-blog for the supported frontmatter fields.',
  },
  {
    id: 'frontmatter-social-cards',
    severity: 'info',
    description:
      "Page frontmatter `social:` block (`cards`, `cards_layout`, `cards_layout_options`) was detected — Material's per-page social-card override. The converter auto-wires `astro-og-canvas` for OG image generation, but per-page customisation works differently in Astro.",
    fix: 'Edit the generator endpoint at `src/pages/og/[...slug].png.ts` and branch on the page slug or frontmatter for per-page layouts. To skip OG generation for a specific page, return a 404 from that endpoint when frontmatter sets `social.cards: false`. Hand-port any `cards_layout_options` (background_color, font_family) into the og-canvas configuration.',
  },
  {
    id: 'blog-more-marker-detected',
    severity: 'info',
    description:
      'A Material blog-post excerpt separator `<!-- more -->` was detected. `starlight-blog` derives post excerpts from frontmatter `excerpt:` (when present) or the first paragraph by default, not from an inline marker.',
    fix: "Move the intended excerpt content into an `excerpt:` frontmatter field on the post for parity, or accept `starlight-blog`'s default behaviour (first paragraph). The marker passes through as an inert HTML comment.",
  },
  {
    id: 'comments-frontmatter-detected',
    severity: 'info',
    description:
      "Page frontmatter sets `comments: true`, Material's flag for activating an optional comments widget (typically Giscus). Starlight has no built-in comments system.",
    fix: 'Install the `starlight-giscus` community plugin (dragomano/starlight-giscus) to recreate per-page comments via GitHub Discussions, or remove the `comments:` frontmatter key if comments were already disabled at the theme level.',
  },
  {
    id: 'button-icon-stripped',
    severity: 'info',
    description:
      'One or more icon shortcodes inside Material `.md-button` link labels resolved to a non-curated icon set (e.g. an obscure FontAwesome solid glyph) and were stripped from the emitted `<LinkButton>` label. The button text is clean, but the icon glyph is lost.',
    fix: 'Three options. (1) Pass an `iconOverrides` map to the converter mapping each shortcode to the closest Starlight built-in icon name (see Starlight\'s icon catalog). (2) Edit the emitted `<LinkButton>` to add `<Icon name="…" slot="icon" />` from a custom Iconify integration if you need pixel-faithful icons. (3) Accept the loss if the icon was decorative.',
    relatedFeatureId: 'buttons',
  },
  {
    id: 'plugin-blog-custom-config',
    severity: 'info',
    description:
      "Material's `blog` plugin has bespoke options beyond `enabled`, `blog_dir`, `post_dir` (defaults). `starlight-blog` accepts a different config shape and does not honor Material's URL templates, pagination knobs, author files, or category whitelists as-is.",
    fix: "Hand-port each option: URL formats (`post_url_format`, `archive_url_format`, `categories_url_format`) become Astro page route patterns under `src/content/docs/`. Pagination (`pagination_per_page`) maps to `starlight-blog`'s `postsPerPage`. `authors_file` becomes the plugin's `authors` config object. `draft_if_future_date` requires a content-collection filter. `categories_allowed` requires the same filter plus a Zod schema enum.",
    relatedFeatureId: 'plugin-blog',
  },
  {
    id: 'extra-version-metadata',
    severity: 'info',
    description:
      'mkdocs.yml `extra.version` carried `default:` and/or `alias: true` metadata beyond the bare `provider:` key. `starlight-versions` does not have a declarative `default`/`alias` field — both are reflected through the actual `versions: [...]` array in `astro.config`.',
    fix: 'For `default:`, mark the matching entry as the canonical one (typically the first item, or the version without a date suffix). For `alias: true`, set each version\'s `label` field to `"<slug> (<alias>)"` so the dropdown surfaces both. The converter scaffolds the `versions: [{ slug: "2.0" }]` placeholder; edit it after migration.',
  },
  {
    id: 'extra-tags-alias-map',
    severity: 'info',
    description:
      "mkdocs.yml `extra.tags` (Material's tag-name → identifier alias map, paired with `theme.icon.tag.<id>` for per-tag icons) was detected. The `starlight-tags` plugin consumes plain-string tags from page frontmatter and does not have a built-in dictionary for assigning per-tag icons.",
    fix: "Tags will pass through as plain strings via `starlight-tags`. If per-tag icons matter to you, render them manually inside a custom Tag.astro component using your own slug → icon map. The `extra.tags` aliases themselves can be preserved by updating each page's `tags:` frontmatter to use the canonical (full) tag name rather than the abbreviation.",
  },
  {
    id: 'copyright-text-detected',
    severity: 'info',
    description:
      'mkdocs.yml `copyright:` was set. Starlight has no first-class `copyright` config option — the text would otherwise be silently dropped.',
    fix: 'Recreate by overriding `Footer.astro` under `src/components/overrides/` with the supplied text rendered inside a `<footer class="sl-flex">` block, then register the override via Starlight `components: { Footer: "./src/components/overrides/Footer.astro" }`.',
  },
  {
    id: 'repo-button-recommendation',
    severity: 'info',
    description:
      'mkdocs.yml `repo_url` was set. The converter wires the URL into Starlight `editLink.baseUrl`, but does not auto-synthesise a header repo-button — Starlight surfaces repo links via the `social: [...]` config.',
    fix: 'Add a `social` entry to your `astro.config` for the repo platform: `{ icon: "github" | "gitlab" | "bitbucket", label: <repo_name>, href: <repo_url> }`. Skip if you already had the same entry in mkdocs.yml `extra.social[]` (the converter has wired that path through). See https://starlight.astro.build/reference/configuration/#social for the full schema.',
  },
  {
    id: 'theme-icon-overrides-detected',
    severity: 'info',
    description:
      'mkdocs.yml `theme.icon` overrides were detected. Starlight has its own icon catalog and slot system; most UI-chrome icons (menu, search, repo, edit, view, previous, next, top, close) cannot be remapped via config.',
    fix: 'For UI-chrome overrides, reproduce via custom component overrides under `src/components/overrides/`. For `theme.icon.admonition.<type>`, set `<Aside icon="…">` per occurrence. For `theme.icon.tag.<id>`, build a custom Tag.astro component using your slug → icon map. For `theme.icon.logo`, pass `logo: { src }` in starlight() pointing at an SVG asset under `src/assets/`. See https://starlight.astro.build/reference/overrides/ for the override surface and slot names.',
  },
  {
    id: 'theme-direction-rtl',
    severity: 'info',
    description:
      'mkdocs.yml `theme.direction: rtl` was set. Starlight has no top-level direction switch — direction is applied per locale.',
    fix: "Add `dir: 'rtl'` to the relevant Starlight `locales: { <code>: { label, lang, dir: 'rtl' } }` entry. Starlight handles bidirectional text and the layout flip for the locale automatically.",
  },
  {
    id: 'tablesort-detected',
    severity: 'info',
    description:
      "`mkdocs.yml` `extra_javascript` references `tablesort`, Material's recommended approach for sortable tables. Astro/Starlight preserves the script reference but the `document$.subscribe(...)` initializer Material runs is MkDocs-specific and does not fire under Astro.",
    fix: 'Add an Astro client script (in a custom Layout override) that runs `new Tablesort(table)` on every `<table>` after page load. Alternatively, accept the loss — most documentation tables do not need user-driven sorting.',
  },
  {
    id: 'extra-analytics-provider-recommended',
    severity: 'info',
    description:
      'mkdocs.yml `extra.analytics.provider` is set to a known non-Google provider (`plausible`, `tag-manager`, etc.). A community Starlight plugin exists for these — installing it is a clean migration path.',
    fix: 'No analytics plugin ships in the canonical Starlight plugin list (https://starlight.astro.build/resources/plugins/). Search npm for a community Starlight analytics plugin matching your provider, or wire your tracking snippet through the Starlight `head` option (https://starlight.astro.build/reference/configuration/#head).',
  },
  {
    id: 'extra-annotate-no-equivalent',
    severity: 'info',
    description:
      'mkdocs.yml `extra.annotate` (custom Pygments selectors that Material uses to anchor popover code annotations to non-comment positions like JSON strings) was detected. Starlight code blocks (ExpressiveCode) do not render Material-style popover annotations at all — the converter already downgrades `(N)!` markers to plain `(N)` and leaves the trailing list as a numbered legend, so custom selectors have no effect.',
    fix: 'No action required unless you want to reimplement the popover UX. To do so, write a custom MDX component (e.g. `<Annotation>`) under `src/components/` and replace the `(N)` markers manually with component invocations.',
  },
  {
    id: 'code-block-opt-out-dropped',
    severity: 'warning',
    description:
      "A fenced code block uses Material's per-block opt-out marker `.no-copy` or `.no-select` (e.g. ```` ``` { .yaml .no-copy } ````). ExpressiveCode (Starlight's code-block renderer) has no per-block toggle for the copy or select buttons, so these markers are silently stripped during conversion and the buttons remain enabled.",
    fix: 'To globally hide the copy or selection buttons, customize ExpressiveCode plugins in `astro.config.mjs` — e.g., `expressiveCode: { plugins: [...remove the copy plugin] }`. Per-block disable is not supported by the Starlight code renderer; if you need it, replace the affected block with a custom MDX component or static `<pre>` markup.',
  },
  {
    id: 'extra-css-code-customization-dropped',
    severity: 'warning',
    description:
      "An `extra_css` file customizes Material's Pygments-based code rendering — either via Material CSS variables (`--md-code-hl-string-color`, `--md-code-fg-color`, `--md-code-bg-color`, `--md-code-hl-color`) or via Pygments token classes under `.highlight` / `.codehilite` (e.g. `.highlight .sb { color: ... }`). ExpressiveCode (Starlight's code renderer) uses Shiki inline-style colors, not Pygments classes, so these rules will have no effect on the rendered code.",
    fix: "Author a custom Shiki theme JSON (export the colors you want for each token type) and pass it to `expressiveCode: { themes: [...] }` in `astro.config.mjs`. To recolor the surrounding frame (background/foreground), use ExpressiveCode's `styleOverrides` option. The original CSS file is still copied through to the output and may continue to style non-code elements; only the code-block selectors are inert.",
  },
  {
    id: 'github-alert-detected',
    severity: 'info',
    description:
      'A GitHub-style alert blockquote (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) was detected in the source. Material does not natively render this syntax; Starlight does not either, but the `starlight-github-alerts` plugin transforms it into Starlight asides at build time.',
    fix: 'No action required if you accept the auto-installed `starlight-github-alerts` plugin (added to `package.json` whenever any source file contains alerts). Alternative: convert each alert manually to a Starlight `:::note` / `:::tip` / `:::caution` / `:::danger` aside directive.',
  },
  {
    id: 'nav-multi-topic-detected',
    severity: 'info',
    description:
      'mkdocs.yml `nav:` has 2+ top-level sections each with their own subtree — Material\'s "navigation topics" pattern, where each section renders as its own sidebar root. Starlight by default flattens all sections into a single sidebar tree, which works but loses the clean per-topic separation.',
    fix: 'Install the `starlight-sidebar-topics` community plugin (HiDeoo) for the closest equivalent to Material\'s behaviour: each top-level section becomes a switchable "topic" with its own scoped sidebar. If a single combined sidebar is acceptable, no action is needed — the converter\'s default output already builds a valid nav.',
  },
  {
    id: 'heading-badge-class-detected',
    severity: 'info',
    description:
      "An ATX heading carried an `attr_list` CSS class (e.g. `## What's New { .badge }`, `### Beta { .new }`). Starlight has no first-class API for classes on headings — the converter strips the `{ ... }` blob — so the styling is silently lost. The most common Material idiom for this is heading badges.",
    fix: 'If the class was a heading badge, install the `starlight-heading-badges` plugin and re-add the badge as inline `<Badge>` JSX next to the heading text. If the class served another purpose (TOC exclusion, layout hint, custom styling), reproduce it via custom CSS or a rehype plugin — Starlight intentionally does not preserve heading-level classes.',
  },
  {
    id: 'output-syntax-error',
    severity: 'error',
    description:
      'A converted file failed to parse under the same MDX/Markdown parser Astro/Starlight uses at build time. The file would crash `astro build`.',
    fix:
      'Inspect the file at the reported line/column. Likely causes, in order of frequency:\n' +
      "  1. **Source-side HTML imbalance or typo** (MkDocs is permissive, MDX is strict). Look for unbalanced `<div>`/`</div>`, typo'd tags like `</divr>`, `<span>` not closed before `</div>`, or HTML attributes missing closing quotes. The fix is to repair the source `.md` and re-run conversion.\n" +
      '  2. **Bare `{` interpreted as JSX expression**. MDX treats `{` as the start of a JS expression. The converter escapes Jinja `{{...}}` / `{%...%}` / `{#...#}` and PyMdown attr_list `{:...}` automatically, but a `{` in arbitrary prose (e.g. pseudo-code `outputMode: OutputMode) extends Sink {` mid-paragraph) still trips the parser. Wrap the offending content in a fenced code block.\n' +
      '  3. **Autolink `<https://…>` or `<email>`** — MDX wants explicit Markdown links `[https://...](https://...)`.\n' +
      '  4. **HTML element needing self-close in MDX** (`<br>` → `<br/>`, `<img ...>` → `<img ... />`).\n' +
      '  5. **Genuine converter bug** — if the file source looks clean and none of the above apply, file an issue with the line/column and the surrounding 3 lines of source.\n\n' +
      'MDX troubleshooting reference: https://mdxjs.com/docs/troubleshooting-mdx/',
  },
  {
    id: 'output-validator-unavailable',
    severity: 'info',
    description:
      "Output syntax validation was skipped because `@mdx-js/mdx` (the parser Astro uses) is not installed in the converter's runtime.",
    fix: 'Install `@mdx-js/mdx` (or run the converter under Node with that package available) to enable post-conversion MDX/Markdown parse validation.',
  },
  {
    id: 'fancylists-promoted',
    severity: 'info',
    description:
      'A `pymdownx.fancylists` Roman numeral or alpha-character ordered list (`i. ii. iii.`, `a. b. c.`, etc.) was promoted to a raw `<ol type="…">` HTML block. remark-parse would otherwise re-number it as decimal, silently losing the list style.',
    fix: 'No action required — the emitted HTML renders identically in Starlight. If you previously customized marker style via CSS targeting `.fancylists-*` classes, port those selectors to target `ol[type="i"]`, `ol[type="a"]`, etc.',
    relatedFeatureId: 'fancylists',
  },
  {
    id: 'wikilinks-rewritten',
    severity: 'info',
    description:
      'A `[[Page Name]]` Python-Markdown wikilink was rewritten to a standard Markdown link (`[Page Name](/page-name/)`). The slug is derived from the label using lowercase + dash-separated normalization (the Python-Markdown default).',
    fix: 'Verify the resolved URL points at the intended page. For Obsidian-imported sites with `[[name|display]]` pipe forms or non-default `base_url`, install `starlight-obsidian` for full vault-style resolution.',
    relatedFeatureId: 'wikilinks',
  },
  {
    id: 'smarty-recommend-smartypants',
    severity: 'info',
    description:
      "`mkdocs.yml` enables Python-Markdown's `smarty` extension (smart quotes, em/en dashes, ellipsis). remark-parse does not perform these substitutions by default, so prose typography would regress after migration.",
    fix: "Add `remark-smartypants` to `markdown.remarkPlugins` in `astro.config.mjs`: `import smartypants from 'remark-smartypants'; ... markdown: { remarkPlugins: [smartypants] }`. The defaults match `smarty`'s ASCII substitutions one-for-one.",
    relatedFeatureId: 'smarty',
  },
  {
    id: 'progressbar-promoted',
    severity: 'info',
    description:
      'A `pymdownx.progressbar` syntax (`[=85% "85%"]` or `[=1/2 "Half"]`) was promoted to a raw `<progress>` HTML element. The `.progress-bar` / `.progress-label` Material CSS classes are not preserved.',
    fix: "No action required for default rendering — Starlight's base styles render `<progress>` natively. If you customized the candy-stripe / level-class look via Material CSS, port those styles to target the `<progress>` element directly.",
    relatedFeatureId: 'progressbar',
  },
  {
    id: 'pymdownx-quotes-callouts-routed',
    severity: 'info',
    description:
      '`mkdocs.yml` enables `pymdownx.quotes` with the `callouts: true` option. The callout syntax (`> [!note]`, `> [!tip] Title`) is identical to GitHub-flavored alerts — already handled by `scan-github-alerts` and the `starlight-github-alerts` plugin (auto-installed when alert syntax is detected).',
    fix: 'No action required — `starlight-github-alerts` renders the callouts as Starlight asides at build time. The lowercase form (`> [!note]`) is supported alongside the GitHub uppercase form (`> [!NOTE]`).',
    relatedFeatureId: 'quotes-callouts',
  },
  {
    id: 'extension-fancylists-promoted',
    severity: 'info',
    description:
      '`pymdownx.fancylists` extension was detected. Roman/alpha numeral lists are promoted to `<ol type="i|I|a|A">` HTML at the normalize stage so Starlight renders them with the correct numeral style.',
    fix: 'No action required — emitted HTML renders natively in Starlight.',
    relatedFeatureId: 'fancylists',
  },
  {
    id: 'extension-quotes-callouts-routed',
    severity: 'info',
    description:
      '`pymdownx.quotes` extension was detected. If `callouts: true` is configured, the callout syntax routes through `scan-github-alerts` and `starlight-github-alerts` (auto-installed when alert markers are present).',
    fix: 'No action required.',
    relatedFeatureId: 'quotes-callouts',
  },
  {
    id: 'extension-wikilinks-rewritten',
    severity: 'info',
    description:
      '`wikilinks` extension was detected. The converter rewrites `[[Page Name]]` to `[Page Name](/page-name/)` using lowercase + dash-separated normalization (Python-Markdown default).',
    fix: 'For Obsidian-style sites with `[[name|display]]` pipe forms or non-default `base_url`, install `starlight-obsidian` for full vault-style resolution.',
    relatedFeatureId: 'wikilinks',
  },
  {
    id: 'extension-smarty-recommend',
    severity: 'info',
    description:
      '`smarty` extension was detected (smart quotes, em/en dashes, ellipsis substitutions). remark-parse does not perform these substitutions by default.',
    fix: 'Add `remark-smartypants` to `markdown.remarkPlugins` in `astro.config.mjs` to preserve typography.',
    relatedFeatureId: 'smarty',
  },
  {
    id: 'extension-pymdownx-extra-expanded',
    severity: 'info',
    description:
      '`pymdownx.extra` meta-bundle was detected. Aliases `betterem`, `superfences`, `footnotes`, `attr_list`, `def_list`, `tables`, `abbr`, and `md_in_html` — all already covered individually.',
    fix: 'No action required for the bundle. Custom `pymdownx.extra: { footnotes: { BACKLINK_TEXT } }` sub-options are dropped — re-enable specific tweaks via the corresponding individual extensions.',
    relatedFeatureId: 'pymdownx-extra',
  },
  {
    id: 'extension-betterem-detected',
    severity: 'info',
    description:
      "`pymdownx.betterem` was detected. remark-parse uses CommonMark emphasis rules, which differ subtly from betterem's smart-emphasis options.",
    fix: 'Spot-check prose with intra-word emphasis (`my_var_name`, `mid*word*emph`) for rendering differences.',
    relatedFeatureId: 'betterem',
  },
  {
    id: 'extension-b64-subsumed',
    severity: 'info',
    description: "`pymdownx.b64` was detected — subsumed by Astro's asset pipeline.",
    fix: 'No action required. To inline images as `data:` URLs explicitly, import them as Astro assets and use the resolved path.',
    relatedFeatureId: 'b64',
  },
  {
    id: 'plugin-minify-subsumed',
    severity: 'info',
    description:
      '`mkdocs-minify-plugin` was detected — subsumed by Astro/Vite production minification.',
    fix: 'No action required.',
    relatedFeatureId: 'plugin-minify',
  },
  {
    id: 'plugin-glossary-recommend',
    severity: 'info',
    description: '`mkdocs-glossary-plugin` was detected (hover-tooltip glossary terms).',
    fix: "Recreate via the converter's `abbr` handling (`*[TERM]: definition`) for plain-text definitions, or build a custom MDX `<Glossary>` component for richer tooltips.",
    relatedFeatureId: 'plugin-glossary',
  },
  {
    id: 'plugin-video-recommend',
    severity: 'info',
    description: '`mkdocs-video` was detected (`![type:video](url)` syntax).',
    fix: 'Replace with native MDX `<video>` elements, or install `starlight-videos` for richer video-guide / course-style components.',
    relatedFeatureId: 'plugin-video',
  },
  {
    id: 'plugin-puml-recommend',
    severity: 'info',
    description: '`mkdocs-puml` or `plantuml-markdown` was detected.',
    fix: 'Install `astro-plantuml` and add to your Astro integrations — the same `@startuml...@enduml` fenced syntax is supported.',
    relatedFeatureId: 'plugin-puml',
  },
  {
    id: 'plugin-encryptcontent-no-equivalent',
    severity: 'warning',
    description:
      '`mkdocs-encryptcontent-plugin` was detected (per-page password encryption). No Starlight equivalent — Astro outputs static HTML with no client-side decryption layer.',
    fix: 'Either remove protected content from the public site, or wrap the deployed `dist/` directory in a custom auth gate (Cloudflare Access, Netlify password protection, etc.).',
    relatedFeatureId: 'plugin-encryptcontent',
  },
  {
    id: 'plugin-charts-no-equivalent',
    severity: 'warning',
    description:
      '`mkdocs-charts-plugin` was detected (Vega-Lite block syntax). No first-class Starlight equivalent.',
    fix: 'Recreate via a custom MDX `<VegaChart>` component using vega-embed, or pre-render charts to SVG/PNG ahead of conversion.',
    relatedFeatureId: 'plugin-charts',
  },
  {
    id: 'plugin-markdownextradata-no-equivalent',
    severity: 'warning',
    description:
      '`mkdocs-markdownextradata-plugin` was detected (`{{ var }}` Jinja-style variable interpolation from `extra.*`). The bare `{{ }}` syntax conflicts with MDX expressions.',
    fix: "Use Astro's `import.meta.env.PUBLIC_*` env variables in MDX (`{import.meta.env.PUBLIC_MY_VAR}`) for the equivalent build-time interpolation.",
    relatedFeatureId: 'plugin-markdownextradata',
  },
  {
    id: 'inline-admonition-modifier-dropped',
    severity: 'info',
    description:
      'A Material admonition with the `inline` or `inline end` modifier was detected. The modifier creates a floated layout (left/right). The Starlight aside directive does not preserve float positioning — only the type and content survive.',
    fix: 'If the float layout is important, recreate via a custom CSS rule: `:global(.float-left .starlight-aside) { float: left; max-width: 50%; margin-right: 1rem; }` in `customCss` and add the `float-left` class manually via a wrapping `<div>` in MDX.',
    relatedFeatureId: 'admonition-block',
  },
  {
    id: 'code-fence-copy-flag-stripped',
    severity: 'info',
    description:
      "A code fence carried the Material `.copy` or `.no-copy` attr_list class. Expressive Code (Starlight's code highlighter) shows a copy button by default with no per-block toggle. The attr_list was stripped during normalization.",
    fix: 'For `.copy` (default-on) — no action required. For `.no-copy` (suppress copy button) — Expressive Code has no per-block disable; either accept the default (copy button stays) or set `frame="none"` per block (which removes the entire chrome, not just the copy button), or globally disable via `expressiveCode.frames.showCopyToClipboardButton: false` in astro.config.mjs.',
    relatedFeatureId: 'code-fence-copy-flag',
  },
  {
    id: 'mkdocs-validation-config-dropped',
    severity: 'info',
    description:
      "mkdocs.yml `validation:` block was detected (MkDocs 1.6+ knobs that govern nav/link error severity). The converter has its own diagnostic taxonomy and emits at `warning` by default — stricter than MkDocs' defaults.",
    fix: "No action required. The converter's diagnostics surface every link/nav issue MkDocs' validation knobs would have flagged, plus more (e.g., `broken-link`, `nav-missing-target`). Review MIGRATION_NOTES.md after conversion. If you previously set `validation.links.absolute_links: relative_to_docs`, the converter resolves absolute links the same way by default.",
  },
  {
    id: 'duplicate-h1-stripped',
    severity: 'info',
    description:
      "A page's body H1 was stripped because it duplicated the frontmatter `title:` value. Material/MkDocs sites conventionally start every page body with `# Title` matching the implicit page title. Starlight auto-renders `title:` as the page H1, so leaving the body H1 produces a visible duplicate (the title appears twice on the rendered page).",
    fix: 'No action required by default — the visible duplicate is gone. Comparison is case-insensitive and whitespace-tolerant; if you want to KEEP the body H1 (because it should differ from the page title in the rendered DOM), change the H1 text to something semantically distinct from the frontmatter `title:` value (e.g., `# Welcome to our docs` vs `title: Welcome`).',
  },
  {
    id: 'slug-conflict-resolved',
    severity: 'warning',
    description:
      "Two source files produced the same Starlight slug — typically `X.md` and `X/index.md` (a Material section-index pattern where the named sibling holds the real content and the directory's index.md is a thin snippet shim). The converter dropped the index.md form and kept the named sibling so the build can proceed.",
    fix: 'Verify the surviving file (the named sibling, e.g. `core/metrics.md`) is the one with the substantive content. If the dropped file actually had unique content, rename one of them or move it to a different path so they no longer collide on the same slug.',
  },
  {
    id: 'page-stub-detected',
    severity: 'warning',
    description:
      "A page in the source contained only an H1 heading and no other body content (e.g., literally just `# Solution Structure\\n`). After the converter's duplicate-H1 strip, the page body is completely empty. The page was a stub in the original Material site too — Material would have rendered just the heading on its own.",
    fix: 'Three options: (a) add real body content to the source markdown file and re-run the converter; (b) delete the stub from the converted output and remove its sidebar entry; (c) accept that the page renders only the title — both Material and Starlight handle empty bodies the same way (Material draws the heading, Starlight draws the title bar — visually equivalent).',
  },
  {
    id: 'placeholder-page-detected',
    severity: 'warning',
    description:
      'A page in the converted output contains only a multi-repo placeholder stub ("This page is a placeholder for the X repo\'s docs"). Material sites using `mkdocs-monorepo-plugin` or `mkdocs-multirepo-plugin` fetch the real content from another repository at MkDocs build time. The converter does not replicate that fetch.',
    fix: "Three options: (a) clone the source repository's content into the page before re-running the converter (`git clone <repo> docs/projects/<name>/`); (b) delete the placeholder file from the converted output and remove the matching sidebar entry from `astro.config.mjs`; (c) replace the page body with a link to the external repository's real docs site (e.g., `[Read the docs](https://hosted.example.com/foo)`).",
    relatedFeatureId: 'plugin-monorepo',
  },
  {
    id: 'mkdocs-strict-mode-info',
    severity: 'info',
    description:
      'mkdocs.yml `strict: true` detected. The converter has no strict mode that fails on any warning.',
    fix: "Approximate strict mode post-migration by treating any `warning`-level diagnostic in MIGRATION_NOTES.md as failing, and run `astro check` (via the converter's `--check` flag) to surface build-blocking errors before deployment.",
  },
  {
    id: 'mkdocs-config-auto-discovered',
    severity: 'info',
    description:
      'No `mkdocs.yml` was found at the supplied project directory, but exactly one candidate was discovered in a subdirectory (commonly `website/`, `docs-site/`, or a monorepo `packages/<name>/`). The converter automatically redirected to that subdirectory so a one-command invocation continues to work.',
    fix: 'No action required. To make the redirect explicit and skip discovery, pass the discovered subdirectory directly as the project directory (the diagnostic message includes the resolved path).',
  },
  {
    id: 'slug-incompatible-path',
    severity: 'info',
    description:
      'A source folder or file basename contains characters that Astro\'s default `github-slugger` would strip during slug generation (e.g. `.` in `1.0/`, `+` in `c++-primer.md`, ampersands, parens, etc.). Without intervention, sidebar entries pointing at the original path would fail with `AstroUserError: The slug "<original>" does not exist.` Common triggers are Mike-versioned doc folders (`1.0/`, `1.1/`) and file basenames borrowed from program identifiers (`c++-primer.md`, `node@18.md`).',
    fix: 'Auto-fixed: the converter emits `docsLoader({ generateId })` (Starlight 0.35+) in `src/content.config.ts` whenever any source path has incompatible segments. The custom `generateId` derives the slug directly from the source path (lowercased, extension stripped, trailing /index|/readme stripped) — so the sidebar entry resolves verbatim. No action required. If you prefer the github-slugger default, rename the offending folder/file on disk to a slug-safe form (`1.0/` → `1-0/`; `c++-primer.md` → `cpp-primer.md`) and re-run; the override drops away automatically once no incompatible paths remain.',
  },
  {
    id: 'path-escapes-base',
    severity: 'warning',
    description:
      'A user-supplied path (snippet directive, `{% include %}` directive, asset reference, or CLI flag) resolves outside its declared base directory after symlink resolution. The converter rejects the read to prevent symlink-mediated reads outside the project tree (`docs/secret-link → /etc/passwd`) and `..` traversal in third-party source documents.',
    fix: 'If the escaping path is unintended (most common case), remove the symlink or replace it with a real file inside the base directory. If you genuinely need to include content from outside the project tree, copy that content into the project tree first and reference it by its in-tree path. If the escaping path is from a CLI flag (e.g., `--snippet-base-path ../../shared`), point the flag at a path inside the project directory instead. Reading outside the base is rejected unconditionally — there is no flag to opt out, by design.',
  },
];

const DIAGNOSTIC_REGISTRY: ReadonlyMap<string, DiagnosticEntry> = new Map(
  REGISTRY_ENTRIES.map((entry) => [entry.id, entry] as const),
);

export function isRegisteredRuleId(id: string): boolean {
  return DIAGNOSTIC_REGISTRY.has(id);
}

export function getRegisteredRuleId(id: string): DiagnosticEntry | null {
  return DIAGNOSTIC_REGISTRY.get(id) ?? null;
}

export function getAllRegisteredRuleIds(): ReadonlyArray<DiagnosticEntry> {
  return REGISTRY_ENTRIES;
}

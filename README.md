# mkdocs-material-to-starlight

[![CI](https://github.com/sitapix/mkdocs-material-to-starlight/actions/workflows/ci.yml/badge.svg)](https://github.com/sitapix/mkdocs-material-to-starlight/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mkdocs-material-to-starlight.svg)](https://www.npmjs.com/package/mkdocs-material-to-starlight)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/mkdocs-material-to-starlight.svg)](./package.json)

**Convert an MkDocs Material site to Astro Starlight.**

The converter reads `mkdocs.yml` and writes a buildable Starlight project with converted pages, navigation, redirects, and locales. It records unsupported syntax and plugins in `MIGRATION_NOTES.md` with file and line numbers.

---

## Quick start

```bash
npx mkdocs-material-to-starlight
```

The wizard reads `mkdocs.yml`, asks about site-specific choices, and writes to `./starlight-out`. Requires Node 20.19+.

```bash
cd ./starlight-out
npm install
npm run dev
```

> Preview the plan without writing files:
> `npx mkdocs-material-to-starlight ./my-mkdocs --explain`

---

## What it converts

<details>
<summary><strong>Markdown syntax and PyMdown extensions</strong></summary>

| MkDocs Material | Starlight output |
|---|---|
| `!!! note "Title"` admonitions (12 types) | `:::note[Title]` aside directives; a generated Astro 7-native remark plugin preserves abstract, info, question, success, failure, bug, and example |
| `??? note` / `???+ note` collapsible | `<details><summary>Title</summary>...</details>` |
| `=== "Tab"` content tabs | Starlight `<Tabs>/<TabItem>` MDX components (default; `--tabs html` keeps `.md` with a shim) |
| `<div class="grid cards" markdown>` | `<div class="sl-card-grid">…</div>` |
| `<div class="grid" markdown>` | `<div class="sl-grid">…</div>` |
| `:material-rocket:` / `:fontawesome-brands-github:` | `:icon[rocket]` / `:icon[github]`, with curated name mapping plus SVG fallback |
| `--8<-- "snippet.md"` | Inlines snippet content (with cycle detection and depth limit) |
| `==text==` highlights | `<mark>text</mark>` |
| `H~2~O` subscripts and `2^10^` superscripts | `<sub>` and `<sup>` |
| `++ctrl+alt+del++` keyboard keys | `<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd>` |
| `[link](api/auth.md)` internal refs | Rewritten to Starlight slugs (`[link](/api/auth)`) |
| Footnotes (`[^1]`) | GFM footnotes via remark-gfm |
| Math (`$inline$`, `$$block$$`) | remark-math plus rehype-katex (deps included) |
| ` ```mermaid ` blocks | astro-mermaid (dep included) |
| MagicLink autolinks (`@user`, `#123`) | Markdown links pointing at GitHub from `repo_url` |
| Definition lists, abbreviations, buttons, CriticMarkup, code annotations | Normalized to standard Markdown or styled HTML |

</details>

<details>
<summary><strong>Site config and navigation</strong></summary>

| MkDocs | Starlight output |
|---|---|
| `nav:` tree | `sidebar` config in `astro.config.mjs` |
| No `nav:` tree | Complete sidebar synthesized from the docs directory tree, with software-aware group casing |
| `site_name`, `site_description`, `site_url` | `title`, `description` on the integration; `site` on Astro config |
| `site_url` with a subpath (GitHub Pages project sites) | Astro `base:` plus `starlight-base-path` so content links resolve on subpath deploys |
| `theme.features: navigation.tabs` | `starlight-sidebar-topics`; top-level nav sections become topics with per-topic sidebars (`--no-sidebar-topics` opts out) |
| `theme.features: navigation.top` | `starlight-scroll-to-top` |
| `theme.features: announce.dismiss` / `content.action.view` | `starlight-announcement` / `starlight-page-actions` |
| `draft_docs` | Matching files receive `draft: true`; `starlight-auto-drafts` keeps them in dev and removes production sidebar links |
| Missing frontmatter `title` | Synthesized from first H1 or a software-aware humanized filename (Starlight requires it) |
| Missing 404 page | Minimal styled `404.md` scaffolded (skipped when the source converts its own) |

</details>

<details>
<summary><strong>Plugins</strong></summary>

| MkDocs plugin | Starlight output |
|---|---|
| `mkdocs-redirects` | `redirects: { … }` in `astro.config.mjs` |
| `mkdocs-static-i18n` | Directory-prefix layout (`fr/page.md`) plus `locales: { … }`; recommends the optional `starlight-i18n` editor extension |
| `mkdocs-section-index` | Section `index.md` hoisted to first child of its sidebar group |
| `mkdocs-literate-nav` | `SUMMARY.md` parsed and used as the nav source |
| `mkdocs-include-markdown-plugin` | `{% include %}` resolved inline before conversion |
| `mkdocs-rss-plugin` | `@astrojs/rss` dep plus `src/pages/rss.xml.ts` scaffold |
| `mkdocs-glightbox` | `starlight-image-zoom` dep |
| `mike` (versioned docs) | `starlight-versions` dep |
| `mkdocs-git-revision-date-localized` | Built-in `lastUpdated: true` |
| `blog`, `tags` (Material) | `starlight-blog`, `starlight-tags` deps |
| `social` (Material, per-page OG cards) | `astro-og-canvas` dep plus a `src/pages/og/[...slug].png.ts` endpoint |
| `mkdocs-d2-plugin` | `astro-d2` dep (the `d2` CLI must be on PATH at build time) |
| Giscus comments (`overrides/partials/comments.html`) | `starlight-giscus` with the repo/category IDs parsed from the partial; unparseable configs stay a diagnostic |
| `mkdocs-swagger-ui-tag` | `starlight-openapi` dep |
| `mkdocs-macros-plugin` (Jinja2) | Diagnostic at each occurrence with a file and line locator |
| `mkdocs-puml` / `plantuml-markdown` | Diagnostic: `astro-plantuml` still peers astro@^5 and won't resolve against the Astro 7 stack |
| Interactive `pymdownx.superfences.custom_fences` | Diagnostic recommending `astro-live-code` and a renderable language fence with the `live` metadata flag |
| `mkdocs-print-site-plugin` | Recommends `starlight-to-pdf` for PDF artifacts; documents the custom `print.astro` path for combined HTML |
| `gen-files`, `monorepo`, `multirepo`, `meta`, `privacy`, `mkdocstrings`, `mkdocs-jupyter` | Diagnostic in `MIGRATION_NOTES.md` with documented workaround |

</details>

---

## Output

```
output/
├── astro.config.mjs              ← migrated config: sidebar, redirects, locales, plugins
├── package.json                  ← scripts and pinned dependencies
├── biome.json                    ← formatter and linter config
├── MIGRATION_NOTES.md            ← human-readable diagnostics, grouped by rule
├── public/                       ← non-Markdown assets (images, PDFs) copied through
└── src/
    ├── content.config.ts         ← docs collection wired to Starlight's loader/schema
    ├── content/docs/             ← converted Markdown pages and a 404 page
    └── styles/mkdocs-migration.css  ← styles for grids, cards, and tabs
```

Run `cd output && npm install && npm run dev` to start the converted site.

---

## Common workflows

```bash
# Interactive conversion
npx mkdocs-material-to-starlight

# Unattended conversion with wizard defaults
npx mkdocs-material-to-starlight ./mkdocs-project ./starlight-out --yes

# Print the migration plan without writing files
npx mkdocs-material-to-starlight ./mkdocs-project --explain

# Run astro check on the output
npx mkdocs-material-to-starlight ./mkdocs-project ./starlight-out --yes --check

# Resolve PyMdown snippets from a custom directory
npx mkdocs-material-to-starlight ./mkdocs-project ./starlight-out \
  --yes --snippet-base-path docs --snippet-base-path includes
```

---

## Diagnostics

The converter reports bad input as typed diagnostics and continues with the remaining files.

In your terminal:

```
api/auth.md:12:4  warning  broken-link  link target "missing.md" was not found in the slug map
```

`outputDir/MIGRATION_NOTES.md` groups diagnostics by rule and file. It also lists unmapped `mkdocs.yml` fields and workarounds for unsupported plugins. Run `--explain` to print each rule's description and fix before conversion.

---

## CLI reference

```
mkdocs-material-to-starlight <project-dir> <output-dir> [options]
mkdocs-material-to-starlight <project-dir> --explain
mkdocs-material-to-starlight compare <baseline-url> <converted-url> [options]

Convert options (run `--help` for the full list):
  --snippet-base-path <path>   Resolve PyMdown snippets against this directory.
                               Repeatable; first match wins.
  --check / --no-check         Run `astro check` against the output and surface
                               its diagnostics. Needs `npm install` in the output
                               directory first; reports the missing install otherwise.
  --check-timeout <ms>         Override the astro-check timeout (default: 10min).
  --sidebar-topics             Install starlight-sidebar-topics for nav.tabs
  --no-sidebar-topics          Keep the flat sidebar instead.
  --tabs <mdx|html>            Tabs output strategy (default: mdx).
  --palette <translate|skip|custom>  Palette handling (default: translate).
  --dry-run                    Plan only, do not write files. (Not yet wired through.)
  --yes                        Accept wizard defaults; skip interactive prompts.

Compare options (visual diff between rendered MkDocs and Starlight pages):
  --pages a,b,c                Comma-separated paths to diff (default: /).
  --threshold 0.01             Mismatch ratio that still counts as a match.
  --report file.md             Write the Markdown report to a file instead of stdout.

Common:
  -h, --help                   Show help.
  --version                    Print the version.
```

Exit codes: `0` success, `1` runtime or check failure, `2` usage error.

Install the `compare` peer dependencies before using that subcommand:

```bash
npm install playwright pixelmatch pngjs
npx playwright install chromium
```

---

## Programmatic API

```ts
import { convertSiteFromDisk } from 'mkdocs-material-to-starlight';

const result = await convertSiteFromDisk({
  projectDir: '/path/to/mkdocs-project',
  outputDir: '/path/to/output',
  snippetBasePaths: ['docs'], // optional; enables snippet expansion
});

if (!result.ok) {
  console.error(`${result.error.code}: ${result.error.message}`);
  process.exit(1);
}

for (const tagged of result.value.diagnostics) {
  console.log(`${tagged.sourcePath}: ${tagged.diagnostic.ruleId}: ${tagged.diagnostic.message}`);
}
```

The success result exposes `astroConfigSource`, `packageJsonSource`, `migrationNotesSource`, and `sidebarSource` for custom write strategies.

---

## Limitations

- The converter maps theme palettes to Starlight custom properties, fonts to Fontsource packages, and extra assets to `customCss` or `head` entries. It records custom `overrides/` templates in `MIGRATION_NOTES.md`. Review translated colors against the Starlight theme.
- The converter cannot evaluate `mkdocs-macros-plugin` Jinja2 expressions. It reports each `{{ … }}` and `{% … %}` occurrence with its file and line.
- `mkdocs-section-index` and `mkdocs-literate-nav` support standard layouts. They do not support recursive per-directory `SUMMARY.md` files or implicit indexes for entries outside `nav:`.
- `--dry-run` has no effect. Use `--explain`.

---

## Architecture

The converter uses [unified](https://unifiedjs.com) and [remark](https://github.com/remarkjs/remark).

- Each transform owns a disjoint MDAST `(node-type, name)` namespace, so plugin order does not change output.
- A second conversion produces byte-identical output: `convert(convert(x)) === convert(x)`.
- Input failures produce typed diagnostics instead of exceptions.
- Pure logic lives in `domain/` and `use-cases/`; `infrastructure/` handles I/O through ports.

```
src/
├── domain/         Pure types, value objects, ports (no I/O, no framework deps)
├── use-cases/      Application orchestration; functional core
├── infrastructure/ Adapters for file system, YAML, unified; the imperative shell
└── interface/      CLI and programmatic API; the only place that wires concrete adapters
```

See each layer's README for import rules: [`src/domain/`](./src/domain/README.md), [`src/use-cases/`](./src/use-cases/README.md), [`src/infrastructure/`](./src/infrastructure/README.md), and [`src/interface/`](./src/interface/README.md).

---

## Development

Requires Node 20.19+.

```bash
npm install
npm test                                      # full suite, runs in ~10s
npm run typecheck                             # tsc --noEmit
npm run build                                 # emit dist/

npx vitest run path/to/file.test.ts           # single test file
npx vitest run -t 'pattern matches subject'   # single test by title
```

Report bugs and submit fixtures at [github.com/sitapix/mkdocs-material-to-starlight/issues](https://github.com/sitapix/mkdocs-material-to-starlight/issues).

---

## License

[MIT](./LICENSE) © sitapix

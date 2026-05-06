# mkdocs-material-to-starlight

[![CI](https://github.com/sitapix/mkdocs-material-to-starlight/actions/workflows/ci.yml/badge.svg)](https://github.com/sitapix/mkdocs-material-to-starlight/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mkdocs-material-to-starlight.svg)](https://www.npmjs.com/package/mkdocs-material-to-starlight)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/mkdocs-material-to-starlight.svg)](./package.json)

Convert MkDocs Material documentation sites to Astro Starlight. Built on the unified/remark ecosystem with plugin-isolated, idempotent, diagnostic-first transforms.

## Quick start

Requires Node ≥ 20. Run the interactive wizard against your MkDocs project — no install needed:

```bash
npx mkdocs-material-to-starlight
```

The wizard auto-detects features in your `mkdocs.yml` and only asks about decisions that actually apply. When it finishes, it prints the equivalent unattended command so you can reproduce the run in CI.

The output directory will contain a complete, buildable Astro/Starlight project:

```
output/
├── astro.config.mjs              ← migrated config + sidebar
├── package.json                  ← buildable scripts + pinned deps
├── MIGRATION_NOTES.md            ← human-readable diagnostics
├── public/                       ← non-Markdown assets (images, PDFs, …)
└── src/
    ├── content/docs/             ← every Markdown file converted
    └── styles/mkdocs-migration.css  ← shim for grid/card/tabs styling
```

Then `cd output && npm install && npm run dev`.

## Usage

```sh
# Interactive wizard (recommended for first-time conversions)
npx mkdocs-material-to-starlight

# Unattended (CI / scripted)
npx mkdocs-material-to-starlight ./mkdocs-project ./starlight-out --yes

# See what will happen, without writing anything
npx mkdocs-material-to-starlight ./mkdocs-project --explain
```

The wizard auto-detects features in your `mkdocs.yml` (tabs, snippets, RSS,
mike versions, i18n, palette) and only asks about decisions that actually
apply to your site. Every wizard answer maps to a CLI flag, so you can
reproduce a wizard run unattended by pasting the equivalent command the
wizard prints at the end.

## CLI

```
mkdocs-material-to-starlight <project-dir> <output-dir> [options]
mkdocs-material-to-starlight <project-dir> --explain
mkdocs-material-to-starlight compare <baseline-url> <converted-url> [options]

Convert options:
  --snippet-base-path <path>   Resolve PyMdown snippets against this directory.
                               Repeatable; first match wins.
  --check                      After conversion, run `astro check` against the
                               output and surface its diagnostics.
  --check-timeout <ms>         Override the astro-check timeout (default: 5min).
  --dry-run                    Plan only — do not write files (not yet implemented).

Compare options (visual-diff between rendered MkDocs and Starlight pages):
  --pages a,b,c                Comma-separated list of paths to diff (default: /).
  --threshold 0.01             Mismatch ratio that still counts as a match.
  --report file.md             Write the Markdown report to a file instead of stdout.

Common:
  -h, --help                   Show help.
  --version                    Print the version.
```

Exit codes follow Unix convention: `0` success, `1` runtime failure, `2` usage error.

`compare` requires Playwright + pixelmatch (`npm install playwright pixelmatch pngjs && npx playwright install chromium`). They are intentionally optional — the converter itself doesn't depend on them.

## What it converts

| MkDocs Material feature | How it appears in Starlight output |
|---|---|
| `!!! note "Title"` admonitions (12 types) | `:::note[Title]` aside directives, type-mapped to Starlight's 4 |
| `??? note` / `???+ note` collapsible | `<details><summary>Title</summary>...</details>` |
| `=== "Tab"` content tabs | `<div class="sl-tabs"><div class="sl-tab" data-label="Tab">...</div></div>` |
| `<div class="grid cards" markdown>` | `<div class="sl-card-grid"><div class="sl-card">...</div></div>` |
| `<div class="grid" markdown>` | `<div class="sl-grid">...</div>` |
| `:material-rocket:` / `:fontawesome-brands-github:` icons | `:icon[rocket]` / `:icon[github]` directives, with curated Material → Starlight name mapping and SVG fallback |
| `--8<-- "snippet.md"` | Snippet content inlined verbatim (with cycle detection + depth limit) |
| `==text==` highlights | `<mark>text</mark>` |
| `H~2~O` subscripts | `H<sub>2</sub>O` |
| `2^10^` superscripts | `2<sup>10</sup>` |
| `++ctrl+alt+del++` keyboard keys | `<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd>` |
| Internal `[link](api/auth.md)` references | Rewritten to Starlight slugs `[link](/api/auth)` |
| Footnotes (`[^1]`) | GFM footnotes (passthrough; remark-gfm) |
| Math (`$inline$`, `$$block$$`) | remark-math + rehype-katex (deps added automatically) |
| ` ```mermaid ` fenced blocks | astro-mermaid (dep added automatically) |
| MagicLink autolinks (`@user`, `#123`) | Markdown link syntax pointing at GitHub when a `repo_url` is configured |
| Definition lists, abbreviations, buttons, CriticMarkup, code annotations | Normalized to standard Markdown / styled HTML |
| `mkdocs.yml` `nav` tree | Starlight `sidebar` config in `astro.config.mjs` |
| `site_name`, `site_description`, `site_url` | `title`, `description` on the Starlight integration; `site` on Astro config |
| `mkdocs-redirects` `redirect_maps` | `redirects: { … }` block in `astro.config.mjs` |
| `mkdocs-static-i18n` per-locale files (`page.fr.md`) | Starlight directory-prefix layout (`fr/page.md`) + `locales: { … }` config |
| `mkdocs-section-index` plugin | Section `index.md` hoisted to first child of its sidebar group |
| `mkdocs-literate-nav` `SUMMARY.md` | Parsed and used as the navigation source |
| `mkdocs-include-markdown-plugin` `{% include %}` | Resolved inline before per-file conversion |
| `mkdocs-rss-plugin` | `@astrojs/rss` dependency + `src/pages/rss.xml.ts` endpoint scaffold |
| `mkdocs-glightbox` | `starlight-image-zoom` dependency |
| `mike` (versioned docs) | `starlight-versions` dependency |
| `mkdocs-git-revision-date-localized` | Starlight built-in `lastUpdated: true` |
| Material `blog`, `tags` plugins | `starlight-blog`, `starlight-tags` dependencies |
| `mkdocs-macros-plugin` (Jinja2) | Per-occurrence diagnostic with file:line locator (cannot be evaluated) |
| Unmappable plugins (`gen-files`, `print-site`, `monorepo`, `multirepo`, `social`, `meta`, `privacy`, `mkdocstrings`, `mkdocs-jupyter`) | Diagnostic in `MIGRATION_NOTES.md` with documented workaround path |

Frontmatter `title` is automatically synthesized when missing — from the first H1 if present, otherwise from a humanized filename (`api/auth-tokens.md` → `Auth Tokens`, `index.md` → `Home`). Starlight requires `title`; the converter ensures every page has one.

## Diagnostics

Conversion is diagnostic-first: transformations that cannot complete attach a `Diagnostic` to the run report rather than throwing. The CLI prints them to stdout in unified-style format:

```
api/auth.md:12:4  warning  broken-link  link target "missing.md" was not found in the slug map
```

The full per-rule breakdown also lands in `outputDir/MIGRATION_NOTES.md` along with any unmapped `mkdocs.yml` top-level fields you may want to migrate by hand.

## Design pillars

The architectural design behind the converter is documented in detail in the research report (see `~/Documents/MkDocs_to_Starlight_Research_20260501/research_report_20260501_mkdocs_to_starlight.md` if you ran the deep-research generation).

- **Plugin-isolated.** Every transform owns a disjoint MDAST `(node-type, name)` namespace. Plugins are commutative within a stage; reordering them does not change output. Adding a new construct never breaks an existing one.
- **Idempotent.** `convert(convert(x)) === convert(x)` byte-equal. Verified at unit, composed, file, site, and CLI levels.
- **Diagnostic-first.** Transformations that cannot complete attach a typed `Diagnostic` to the run report. They never throw — a single malformed admonition cannot abort a 2,000-page conversion.
- **Functional core, imperative shell.** Business logic is pure functions in `domain/` and `use-cases/`. All I/O (file reads, YAML parsing, file writes) lives behind ports in `infrastructure/` and is wired into use-cases at the `interface/` boundary.

## Architecture

```
src/
├── domain/         Pure types, value objects, and ports (no I/O, no framework deps)
├── use-cases/      Application orchestration; functional core
├── infrastructure/ Adapters for file system, YAML, unified — the imperative shell
└── interface/      CLI and programmatic API; the only place that wires concrete adapters
```

`CLAUDE.md` contains the complete working agreement and the 14 architectural rules every change is held to.

## Programmatic API

```ts
import { convertSiteFromDisk } from 'mkdocs-material-to-starlight';

const result = await convertSiteFromDisk({
  projectDir: '/path/to/mkdocs-project',
  outputDir: '/path/to/output',
  snippetBasePaths: ['docs'], // optional — enables snippet expansion
});

if (!result.ok) {
  console.error(`${result.error.code}: ${result.error.message}`);
  process.exit(1);
}

for (const tagged of result.value.diagnostics) {
  console.log(`${tagged.sourcePath}: ${tagged.diagnostic.ruleId}: ${tagged.diagnostic.message}`);
}
```

The result also exposes the generated `astroConfigSource`, `packageJsonSource`, `migrationNotesSource`, and `sidebarSource` for inspection.

## Development

Requires Node ≥ 20.

```bash
npm install
npm test                                      # full suite (~860 tests, <2s)
npm run typecheck                             # tsc --noEmit
npm run build                                 # emit dist/

npx vitest run path/to/file.test.ts           # single test file
npx vitest run -t 'pattern matches subject'   # single test by title
```

## Testing discipline

This project follows Test-Driven Development strictly. Every commit that introduces production code includes the failing test that motivated it. The discipline is documented in `CLAUDE.md`.

The idempotency property test runs the full pipeline twice on every fixture and asserts byte-equality of the second pass. If this test fails, the pipeline has order-coupling — fix it before merging.

The structural regression suite in `tests/integration/nesting-regression.test.ts` asserts that nested constructs (cards inside grids, tabs inside tab containers) appear *between* the outer wrapper's open/close tags, not as orphan siblings. This test class catches the kind of bug that "presence" assertions miss.

## Limitations

- `mkdocs.yml` `theme.palette` colors and custom theme overrides (`overrides/`, `extra_css`, `extra_javascript`) are surfaced in `MIGRATION_NOTES.md` rather than translated automatically.
- `mkdocs-macros-plugin` Jinja2 expressions cannot be evaluated. Each `{{ … }}` and `{% … %}` site is reported in `MIGRATION_NOTES.md` with file and line so they can be replaced by hand.
- The `mkdocs-section-index` and `mkdocs-literate-nav` integrations cover the common cases; advanced features (literate-nav per-directory `SUMMARY.md` recursion, section-index implicit-index injection for entries not present in `nav:`) are not yet implemented.
- The `--dry-run` flag is not yet wired through (parsed but ignored).

## License

[MIT](./LICENSE) © sitapix

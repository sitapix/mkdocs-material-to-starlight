# mkdocs-material-to-starlight

[![CI](https://github.com/sitapix/mkdocs-material-to-starlight/actions/workflows/ci.yml/badge.svg)](https://github.com/sitapix/mkdocs-material-to-starlight/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mkdocs-material-to-starlight.svg)](https://www.npmjs.com/package/mkdocs-material-to-starlight)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/mkdocs-material-to-starlight.svg)](./package.json)

**Move your MkDocs Material site to Astro Starlight without rewriting pages by hand.**

Point one command at your `mkdocs.yml` and get a buildable Starlight project: pages converted, plugins mapped, sidebar wired up, redirects preserved, i18n intact. Anything the converter cannot handle lands in `MIGRATION_NOTES.md` with a file and line number.

---

## Quick start

```bash
npx mkdocs-material-to-starlight
```

The interactive wizard reads your `mkdocs.yml`, asks about the decisions that apply to your site, and writes a working Astro project. Then:

```bash
cd ./starlight-out
npm install
npm run dev
```

Your docs are live on Starlight. Requires Node 20+.

> **Preview the plan without writing files:**
> `npx mkdocs-material-to-starlight ./my-mkdocs --explain`

---

## Why use this

- **Tested at real scale.** Conversion finishes in seconds, even on thousand-page sites. A `--check` run adds seconds to a couple of minutes depending on site size (it needs `npm install` to have run in the output directory first; without it, the check reports that immediately instead of hanging).
- **Maps every Material feature.** Admonitions, tabs, grids, snippets, icons, math, mermaid, i18n, mike versions. Features without a clean Starlight equivalent (Jinja macros, custom theme overrides) become diagnostics with file and line numbers.
- **Scripts cleanly.** The wizard prints its equivalent unattended command on exit. Drop that command into a CI workflow. Exit codes follow Unix convention.
- **Idempotent.** Running it twice produces byte-identical output, so reruns do not churn diffs.

---

## What it converts

If MkDocs Material renders it, this tool maps it. The mapping by area:

<details>
<summary><strong>Markdown syntax and PyMdown extensions</strong></summary>

| MkDocs Material | Starlight output |
|---|---|
| `!!! note "Title"` admonitions (12 types) | `:::note[Title]` aside directives; the 7 types Starlight's 4 asides can't express (abstract, info, question, success, failure, bug, example) are preserved as first-class blocks via `starlight-markdown-blocks` |
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
| `site_name`, `site_description`, `site_url` | `title`, `description` on the integration; `site` on Astro config |
| `site_url` with a subpath (GitHub Pages project sites) | Astro `base:` plus `starlight-base-path` so content links resolve on subpath deploys |
| `theme.features: navigation.tabs` | `starlight-sidebar-topics` — top-level nav sections become topics with per-topic sidebars (`--no-sidebar-topics` opts out) |
| `theme.features: navigation.top` | `starlight-scroll-to-top` |
| `theme.features: announce.dismiss` / `content.action.view` | `starlight-announcement` / `starlight-page-actions` |
| Missing frontmatter `title` | Synthesized from first H1 or humanized filename (Starlight requires it) |
| Missing 404 page | Minimal styled `404.md` scaffolded (skipped when the source converts its own) |

</details>

<details>
<summary><strong>Plugins</strong></summary>

| MkDocs plugin | Starlight output |
|---|---|
| `mkdocs-redirects` | `redirects: { … }` in `astro.config.mjs` |
| `mkdocs-static-i18n` | Directory-prefix layout (`fr/page.md`) plus `locales: { … }` |
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
| `mkdocs-macros-plugin` (Jinja2) | Per-occurrence diagnostic with file:line locator (cannot be evaluated) |
| `mkdocs-puml` / `plantuml-markdown` | Diagnostic — `astro-plantuml` still peers astro@^5 and won't resolve against the Astro 7 stack |
| `gen-files`, `print-site`, `monorepo`, `multirepo`, `meta`, `privacy`, `mkdocstrings`, `mkdocs-jupyter` | Diagnostic in `MIGRATION_NOTES.md` with documented workaround |

</details>

---

## What you get

```
output/
├── astro.config.mjs              ← migrated config: sidebar, redirects, locales, plugins
├── package.json                  ← scripts and pinned deps for every feature you used
├── biome.json                    ← formatter/linter config (npm run format works day one)
├── MIGRATION_NOTES.md            ← human-readable diagnostics, grouped by rule
├── public/                       ← non-Markdown assets (images, PDFs) copied through
└── src/
    ├── content.config.ts         ← docs collection wired to Starlight's loader/schema
    ├── content/docs/             ← every Markdown page, converted (plus a 404 page)
    └── styles/mkdocs-migration.css  ← shim so grids, cards, and tabs render correctly
```

The project builds as-is for the common case. `cd output && npm install && npm run dev` and you have a running Starlight site.

---

## Common workflows

```bash
# First-time conversion: interactive wizard (recommended)
npx mkdocs-material-to-starlight

# Unattended (CI or scripted): accepts the wizard's defaults
npx mkdocs-material-to-starlight ./mkdocs-project ./starlight-out --yes

# Dry-run: print the migration plan, write nothing
npx mkdocs-material-to-starlight ./mkdocs-project --explain

# Run with astro check so type and link errors fail fast
npx mkdocs-material-to-starlight ./mkdocs-project ./starlight-out --yes --check

# Resolve PyMdown snippets from a custom directory
npx mkdocs-material-to-starlight ./mkdocs-project ./starlight-out \
  --yes --snippet-base-path docs --snippet-base-path includes
```

The wizard prints the equivalent unattended command when it finishes, ready to paste into CI.

---

## Diagnostics

The converter does not throw on bad input. Anything it cannot handle becomes a typed diagnostic on the run report. A malformed admonition will not abort a 2,000-page conversion.

In your terminal:

```
api/auth.md:12:4  warning  broken-link  link target "missing.md" was not found in the slug map
```

In `outputDir/MIGRATION_NOTES.md`:

- A per-rule breakdown of every diagnostic, grouped by file
- Any unmapped `mkdocs.yml` top-level fields you may want to migrate by hand
- Workaround pointers for plugins that have no clean Starlight equivalent

Every rule is documented. `--explain` prints the registered description and fix for each one before you run a conversion.

---

## CLI reference

```
mkdocs-material-to-starlight <project-dir> <output-dir> [options]
mkdocs-material-to-starlight <project-dir> --explain
mkdocs-material-to-starlight compare <baseline-url> <converted-url> [options]

Convert options (abbreviated — run --help for the full Tier 1/Tier 2 list):
  --snippet-base-path <path>   Resolve PyMdown snippets against this directory.
                               Repeatable; first match wins.
  --check / --no-check         Run `astro check` against the output and surface
                               its diagnostics. Needs `npm install` in the output
                               directory first; reports that immediately otherwise.
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

The `compare` subcommand requires Playwright and pixelmatch as optional peers:

```bash
npm install playwright pixelmatch pngjs
npx playwright install chromium
```

These are optional. The converter itself does not depend on them.

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

The success result also exposes `astroConfigSource`, `packageJsonSource`, `migrationNotesSource`, and `sidebarSource` for inspection or custom write strategies.

---

## Limitations

Read these before you commit the output:

- **Theme palette, fonts, `extra_css`, and `extra_javascript` are auto-translated** (accent colors → Starlight custom properties, `theme.font` → Fontsource packages, extra assets → `customCss`/`head` entries), but **custom `overrides/` templates are not** — they land in `MIGRATION_NOTES.md`. Starlight's design system differs from Material's, so review the translated colors against the Starlight theme.
- **`mkdocs-macros-plugin` Jinja2 expressions** cannot be evaluated. Each `{{ … }}` and `{% … %}` site is reported with file and line so it can be replaced by hand.
- **`mkdocs-section-index` and `mkdocs-literate-nav`** cover the common cases. Advanced patterns (per-directory recursive `SUMMARY.md`, implicit-index injection for entries not in `nav:`) are not yet implemented.
- **`--dry-run`** is parsed but a no-op. Use `--explain` instead.

Run `--explain` first to see which features in your site will trigger diagnostics.

---

## How it works

Built on the [unified](https://unifiedjs.com) and [remark](https://github.com/remarkjs/remark) ecosystem. Four design pillars:

- **Plugin-isolated.** Every transform owns a disjoint MDAST `(node-type, name)` namespace. Plugins are commutative; reordering them does not change output.
- **Idempotent.** `convert(convert(x)) === convert(x)` byte-equal. Verified at unit, composed, file, site, and CLI levels.
- **Diagnostic-first.** Failures attach typed diagnostics to the report. They never throw.
- **Functional core, imperative shell.** Pure logic in `domain/` and `use-cases/`. All I/O lives behind ports in `infrastructure/`.

```
src/
├── domain/         Pure types, value objects, ports (no I/O, no framework deps)
├── use-cases/      Application orchestration; functional core
├── infrastructure/ Adapters for file system, YAML, unified; the imperative shell
└── interface/      CLI and programmatic API; the only place that wires concrete adapters
```

Each layer's import rules and boundaries are documented in its own README ([`src/domain/`](./src/domain/README.md), [`src/use-cases/`](./src/use-cases/README.md), [`src/infrastructure/`](./src/infrastructure/README.md), [`src/interface/`](./src/interface/README.md)). The contributor working agreement — gates, dependency-refresh procedure, the real-world field-test loop, release flow — lives in [`CLAUDE.md`](./CLAUDE.md).

---

## Development

Requires Node 20+.

```bash
npm install
npm test                                      # full suite, runs in ~10s
npm run typecheck                             # tsc --noEmit
npm run build                                 # emit dist/

npx vitest run path/to/file.test.ts           # single test file
npx vitest run -t 'pattern matches subject'   # single test by title
```

Every commit that introduces production code includes the failing test that motivated it. The idempotency property test runs the full pipeline twice on every fixture and asserts byte-equality of the second pass.

Bug reports, real-world fixtures, and PRs are welcome at [github.com/sitapix/mkdocs-material-to-starlight/issues](https://github.com/sitapix/mkdocs-material-to-starlight/issues). Sites that break the converter are the most valuable contribution.

---

## License

[MIT](./LICENSE) © sitapix

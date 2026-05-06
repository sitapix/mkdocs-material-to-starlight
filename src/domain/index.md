# Domain Layer

Pure business types for the MkDocs → Starlight migration. **No I/O, no framework imports, no logging.**

This layer answers: *"What things exist in this problem?"* — admonition types, snippet references, sidebar entries, diagnostics, slug maps. Everything here can be tested in milliseconds without mocking anything.

## Allowed imports

- Other modules in `domain/`
- Standard library only (no `node:fs`, no `unified`, no `vfile`)

## Forbidden imports

- `use-cases/`, `infrastructure/`, `interface/`
- Any third-party runtime dependency
- Any side-effecting module (file system, network, time)

## Sub-modules

- `syntax/` — typed value objects for MkDocs source constructs (admonitions, tabs, snippets, grids, icon shortcodes)
- `starlight/` — typed value objects for Starlight target constructs (asides, tabs blocks, cards, icon refs)
- `diagnostics/` — `Diagnostic` records (severity, ruleId, message, place); the typed error channel
- `config/` — declarative shapes for `mkdocs.yml`, `.pages`, and Starlight sidebar/frontmatter
- `transform/` — plugin contracts (id, dependencies, stage, namespace) — pure types only

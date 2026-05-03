# CLAUDE.md — Working agreement for this codebase

This file is loaded into every Claude Code session that touches this repo. Treat it as the contract.

## Mission

Convert MkDocs Material documentation sites to Astro Starlight. The architecture and feature catalog live in `~/Documents/MkDocs_to_Starlight_Research_20260501/research_report_20260501_mkdocs_to_starlight.md` (the design spec). Read it before non-trivial changes.

## Discipline

### TDD is non-negotiable

No production code without a failing test first. Watch the test fail. Watch it pass. Refactor only when green. Configuration files (`package.json`, `tsconfig*.json`, `vitest.config.ts`) are exempt.

If you find production code without a corresponding test, that is a bug. Either delete the code, or add the test that should have come first and verify it would have failed.

### Idempotency is the master invariant

`convert(convert(x)) === convert(x)` on every artifact. The pipeline can be run twice without changing the output. Every transform marks consumed nodes (`node.data.starlightConverted`) so the second pass is a no-op. The CI runs an idempotency property test on the full fixture corpus.

### Diagnostics over throws

Transformations that cannot complete attach a typed `Diagnostic` to the file's vfile. They never throw. Throwing is reserved for unrecoverable conditions (parse failure on the entire file, unreadable file, OOM). A single malformed admonition must not abort a 2,000-page conversion.

## Architectural rules

These are mandatory. Reviews reject violations.

### Layer boundaries (HIGH)

```
interface  ──► use-cases ──► domain
              │
              └─► infrastructure (via ports declared in domain)
```

- `domain/` imports nothing outside itself except the standard library. No `unified`, no `vfile`, no `node:fs`.
- `use-cases/` imports `domain/` and pure libraries (`unified`, `unist-util-visit`). Side effects only via injected ports.
- `infrastructure/` imports `domain/` and side-effecting libraries. Never imports `use-cases/`.
- `interface/` is the only place that wires concrete infrastructure into use-cases.

### Functional core, imperative shell (HIGH)

Business logic is pure functions. Side effects (file I/O, network, time, logging) are pushed to the outermost shell modules (`infrastructure/`, `interface/cli/`). Pure functions are testable without mocks; integration tests cover the shell.

### Command-Query Separation (HIGH)

Functions either return a value (queries) or mutate state (commands), never both. A function named `compileNavigation` returns the compiled config; it does not also write a file. A function named `writeManifest` mutates the file system; it does not also compute the manifest.

### Explicit control flow & data flow (HIGH)

Branching and early-return are visible at the call site. Mutating an input parameter is forbidden — return a new value. Side effects are not hidden inside helpers; if a function logs or writes, its name says so or its return type carries the effect (`Result<T, Diagnostic[]>`).

### Principle of least astonishment (HIGH)

A function does what its name says, nothing more. `parseAdmonition` parses; it does not also normalize whitespace, log, or call out to the file system. Splitting two responsibilities into two named functions is always cheaper than the bug that comes from coupling them.

### Typed error handling (HIGH)

Errors are values, not exceptions. The `Diagnostic` type and the `Result<T, E>` pattern carry failure information. `try`/`catch` is allowed only at infrastructure boundaries (where exceptions originate from third-party libraries) and is immediately translated into a `Diagnostic`. Empty catches are forbidden.

### Domain-specific naming (HIGH)

No `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`. Names describe the domain: `admonition-type.ts`, `slug-map.ts`, `snippet-resolver.ts`. If you cannot name a module by its domain role, the module does not exist yet — split it.

### Library-first (HIGH)

Before writing custom code for parsing, AST traversal, YAML, glob, or path resolution, search the unified ecosystem (`unist-util-*`, `mdast-util-*`, `remark-*`) and Node's standard library. Custom AST utilities are forbidden when a `unist-util-*` package exists.

### Early returns (MEDIUM)

Guard clauses reduce nesting. The "happy path" is the dominant flow; each precondition violation returns or yields a `Diagnostic` and exits.

### Call-site honesty (MEDIUM)

Logging, file writes, and other observable effects are visible where they are triggered. A function that logs lists `log` in its dependency parameters; it does not reach for a global logger.

### Function & file size (MEDIUM)

Functions are <80 lines. Files are <200 lines. These are not arbitrary — large functions hide branches, large files hide cohesion problems. When you bump against the limit, the right answer is almost always to split.

## Naming conventions

- Files: `kebab-case.ts`. Tests: `kebab-case.test.ts` co-located with source.
- Types: `PascalCase`. Values and functions: `camelCase`. Constants: `SCREAMING_SNAKE_CASE`.
- One exported symbol per file when the symbol is non-trivial.

## Build, test, type-check

```bash
npm test                                      # full suite (~800 tests, <2s)
npm run test:watch                            # interactive
npm run typecheck                             # tsc --noEmit
npm run build                                 # tsc -p tsconfig.build.json

npx vitest run path/to/file.test.ts           # single test file
npx vitest run -t 'pattern matches subject'   # single test by title
npx vitest run path/to/dir/                   # one directory
```

CI runs `test`, `typecheck`, and `build`; any failure rejects the change.

## Layer map

```
src/
├── domain/         Pure types, ports, value objects. Imports stdlib only.
├── use-cases/      Pure orchestration. Imports domain + pure libs (unified, mdast).
│                   Side effects only via injected ports.
├── infrastructure/ Adapters: node:fs, child_process, yaml, Playwright, pixelmatch.
│                   The only modules that may import side-effecting libraries.
└── interface/      CLI (cli/) + programmatic API (api/). The only place that
                    wires concrete infrastructure into use-cases.
```

Tests are co-located (`foo.ts` ↔ `foo.test.ts`). Cross-layer integration tests
live under `tests/integration/`.

## Two registries are load-bearing

Both are pure-data modules, both have invariants enforced by test, both are
the single source of truth for their concept. **Add to the registry first; emit
later** — production code that emits an unregistered `ruleId` fails CI.

| Registry | File | Invariant |
|---|---|---|
| Diagnostics | `domain/diagnostics/registry.ts` | every `ruleId` literal in `src/` (excluding tests) must be registered with non-empty description and fix |
| Conversion mapping | `domain/conversion-mapping/table.ts` | every diagnostic's optional `relatedFeatureId` must reference a real row |

When you add a new transform/normalizer/plugin handler, the workflow is:
1. Add the row to `conversion-mapping/table.ts` (the `--explain` CLI reads this)
2. Add any new `ruleId`s to `diagnostics/registry.ts`
3. Implement the transform; its emitted diagnostics now pass the registry test

## CLI surface

```
mkdocs-to-starlight <project-dir> <output-dir> [options]
mkdocs-to-starlight <project-dir> --explain
mkdocs-to-starlight compare <baseline-url> <converted-url> [options]
```

Convert options: `--snippet-base-path <path>` (repeatable), `--check` (run
`astro check` against output), `--check-timeout <ms>`, `--dry-run` (stub).
Compare options: `--pages a,b,c`, `--threshold 0.01`, `--report file.md`.

The CLI exits `0` success, `1` runtime/check failure, `2` usage error. Convert
mode + `--check` returns 1 if any astro-check error fires.

## Optional adapters (lazy imports)

`Playwright` and `pixelmatch + pngjs` are **not** in `package.json`.
`infrastructure/browser/playwright-automator.ts` and
`infrastructure/image/pixelmatch-differ.ts` use `await import('playwright')` etc.
and surface a typed `driver-missing` error if the module isn't installed. This
keeps the converter usable for users who only want Markdown→Markdown. Don't
promote either to a hard dependency — the missing-driver path is part of the
contract and is covered by smoke tests.

## Where to look

- `domain/ports/*.ts` — every I/O boundary. Adding a new external dependency
  almost always means adding a port + an adapter, not direct imports.
- `use-cases/convert-site/convert.ts` — per-file pipeline orchestrator. Most
  feature wiring lands here.
- `interface/api/convert-site.ts` — top-level shell that wires everything for
  the CLI and the programmatic API. New plugins/features get detected and
  threaded through here.
- `tests/integration/api-convert-site.test.ts` — end-to-end smoke for new
  features. If you wire a new plugin into `interface/api/`, add a test here.

## When in doubt

1. Re-read this file.
2. Re-read the research report.
3. Add the test first.
4. Pick the smallest possible change that turns the test green.

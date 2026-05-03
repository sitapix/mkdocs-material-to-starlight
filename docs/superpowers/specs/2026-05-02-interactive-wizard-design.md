# Interactive `npx` Wizard — Design

**Status:** Draft
**Date:** 2026-05-02
**Owner:** straightcheelingbro@gmail.com
**Scope:** add an interactive TUI to `mkdocs-to-starlight` so users can run `npx mkdocs-to-starlight` with no arguments and be walked through a one-shot migration. Existing POSIX-style flags continue to work unchanged for scripted/CI use.

---

## 1. Goals

1. **Zero-arg launch.** `npx mkdocs-to-starlight` (no positionals, no flags) → wizard. Any flag/positional present → current non-interactive behavior.
2. **Tiered prompt set.** Vanilla MkDocs sites see ~5 questions; complex sites surface conditional prompts only when the underlying feature is detected. An "Advanced" menu at the end exposes power-user toggles.
3. **POSIX-compliant flag surface.** Every wizard answer maps to a flag, so `npx mkdocs-to-starlight … --yes` runs unattended and produces the same output as the wizard's defaults.
4. **TTY/CI etiquette.** Honor `NO_COLOR`, `FORCE_COLOR`, `CI`. Auto-disable prompts when stdin/stdout aren't TTYs. Explicit flags override env.
5. **npx-friendly.** Lazy-import @clack/prompts so the cold-start cost when running `--yes` (no wizard) stays near current.
6. **Testable without a terminal.** Wizard logic is pure orchestration over a `Prompter` port. The clack adapter is one thin file with a smoke test.

## 2. Non-goals (v1)

- "Re-run with last answers" detection (`MIGRATION_NOTES.md` parsing for prefilled defaults). Revisit if users ask.
- Interactive `compare` subcommand. Power-user / CI tool — stays flag-only.
- Interactive `--explain`. The wizard *invokes* explain internally to drive conditional prompts; standalone `--explain` stays text-only.
- Theme/template forking, scaffold-from-blank-Starlight, or any non-migration flow.
- Network fetches inside prompts (e.g., remote snippet URLs). The converter's existing SSRF refusal stands.

## 3. Wizard flow

The wizard runs `--explain` internally (`use-cases/explain-conversion/explain.ts`) immediately after collecting project + output dir. The result drives which Tier 1 prompts fire — single source of truth for "what would happen."

### Tier 0 — always asked (5 questions)

| # | Prompt | Type | Default | Flag mapping |
|---|---|---|---|---|
| 1 | Project directory | text | `process.cwd()` | positional[0] |
| 2 | Output directory | text | `./<site_name>-starlight` (derived from `mkdocs.yml`) | positional[1], `-C/--dir` |
| 3 | Package manager (for "what next" hint) | select | auto-detect from `npm_config_user_agent`, fall back to `npm` | `--package-manager=npm\|pnpm\|yarn\|bun` |
| 4 | Run `astro check` after conversion? | confirm | yes | `--check` / `--no-check` |
| 5 | Final summary → "Convert now?" | confirm | yes | (n/a — implied by wizard run) |

After the explain pre-pass, before question 5, a `note()` prints a one-screen summary of the conversion plan (file count, detected features, plugins) so the user sees what's about to happen.

### Tier 1 — conditional, only if detected

Each fires only when its trigger appears in the parsed `mkdocs.yml`:

| Trigger | Prompt | Type | Default | Flag mapping |
|---|---|---|---|---|
| `theme.features: content.tabs.link` | Tabs strategy | select { plain HTML, MDX `<Tabs syncKey>` } | MDX | `--tabs=mdx\|html` |
| `theme.features: navigation.tabs` | Install `starlight-sidebar-topics` and split sidebar? | confirm | yes | `--sidebar-topics` / `--no-sidebar-topics` |
| `pymdownx.snippets` configured | Snippet base paths | multiselect from auto-scanned candidate dirs (incl. `mkdocs.yml`'s `base_path`) | all detected | `--snippet-base-path` (repeatable, existing) |
| `mkdocs-redirects` plugin | Confirm redirect map (read-only preview) | note + confirm | (n/a) | (n/a) |
| `i18n` plugin or `extra.alternate` | Confirm/trim locales | multiselect | all detected | `--locale=…` (repeatable, new) |
| `rss` plugin | Generate `src/pages/rss.xml.ts`? | confirm | yes | `--rss` / `--no-rss` |
| `mike` plugin | Versions slug list | text (comma-separated) | empty (warn) | `--mike-versions=v1,v2,…` |
| Material palette set | Port palette to Starlight accent? | select { translate, skip, custom } | translate | `--palette=translate\|skip\|custom` |
| Any `extra_css` or `extra_javascript` | Carry these over? | multiselect of detected paths | all detected | `--extra-asset` (repeatable, new) |

### Tier 2 — "Show advanced options?" → menu

A single `select` at the end: { *Convert now*, *Show advanced options* }. Picking advanced opens a `groupMultiselect` covering:

- `--no-links-validator` — skip `starlight-links-validator` (currently always on; slow first build)
- `--expressive-code-theme=<name>` — override the auto-translated Shiki theme pair
- `--cards=mdx|html|skip` — `<Card>`/`<CardGrid>` MDX vs HTML+shim vs no shim
- `--mdx-mode=auto|always|never` — `.mdx` promotion strategy
- `--logo-replaces-title` — set Starlight `logo.replacesTitle: true`
- `--admonition-map=<json-path>` — override the 12→4 Material→Starlight admonition collapse
- `--keep-explicit-heading-ids` — emit `<a id="…">` instead of silently dropping
- `--no-smart-symbols` / `--no-emoji-shortcodes` / `--no-inline-marks` — opt out of text rewriters
- `--no-auto-append` — don't append `auto_append` content to every page
- `--snippet-max-depth=<N>` (default 8), `--snippet-dedent-subsections`
- `--suppress=<ruleId>` (repeatable) — mute info-level diagnostics
- `--config-format=mjs|ts` — emit `astro.config.mjs` (default) or `astro.config.ts`
- `--package-name=<name>` — override slugified default

Advanced answers map 1:1 to flags so a power user can also bypass the wizard entirely.

### Idempotency on existing output dir

If `outputDir` exists and is non-empty:
- **Interactive (TTY):** prompt `select { Overwrite, Merge, Cancel }`. Overwrite clears the dir first; Merge writes over file-by-file; Cancel exits 0.
- **Non-interactive without `--force`:** fail with code 1 and a message naming `--force` as the way through.
- **Non-interactive with `--force`:** Overwrite path.

The wizard never silently destroys a non-empty directory.

### Cancel handling

Every clack prompt is wrapped to detect `isCancel(value)` and return `Result.err(WizardCancelled)` from `runWizard`. The interface-layer `wizard-runner.ts` is the only module that observes the cancel: it calls `cancel('Aborted by user')` for the visual goodbye and exits **130** (POSIX SIGINT convention). The pure use-case never throws and never touches `process.exit` — `WizardCancelled` is a typed value, consistent with the project's "diagnostics over throws" rule.

## 4. Flag surface (POSIX, kebab-case)

### Existing (unchanged)

`--snippet-base-path <p>` (repeatable), `--dry-run`, `--check`, `--check-timeout <ms>`, `--explain`, `--help`, `-h`, `--version`, `compare` subcommand.

### New global flags

| Flag | Type | Purpose |
|---|---|---|
| `-y, --yes` | bool | Accept all defaults; skip wizard. Required to convert from CI. |
| `--no-interactive` | bool | Force non-interactive; fail if required args missing (no prompts). |
| `--ci` | bool | Implies `--no-interactive` and disables color regardless of TTY. |
| `-f, --force` | bool | Overwrite non-empty output dir without confirmation. |
| `-q, --quiet` | bool | Suppress info logs; only warnings/errors. |
| `--json` | bool | Emit conversion plan/report as JSON to stdout (human logs to stderr). |
| `--color` / `--no-color` | bool | Override TTY/env detection. |
| `-C, --dir <path>` | string | Output directory (alternative to positional[1]). |
| `--package-manager <pm>` | enum | `npm\|pnpm\|yarn\|bun` |

### New decision flags (Tier 1 + 2)

`--tabs`, `--sidebar-topics`, `--no-sidebar-topics`, `--locale` (repeatable), `--rss`, `--no-rss`, `--mike-versions`, `--palette`, `--extra-asset` (repeatable), `--no-links-validator`, `--expressive-code-theme`, `--cards`, `--mdx-mode`, `--logo-replaces-title`, `--admonition-map`, `--keep-explicit-heading-ids`, `--no-smart-symbols`, `--no-emoji-shortcodes`, `--no-inline-marks`, `--no-auto-append`, `--snippet-max-depth`, `--snippet-dedent-subsections`, `--suppress` (repeatable), `--config-format`, `--package-name`.

### Precedence

1. Explicit CLI flag
2. Env var (`NO_COLOR`, `FORCE_COLOR`, `CI`, `npm_config_user_agent`)
3. TTY detection
4. Hardcoded default

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success (or `--dry-run` plan emitted) |
| 1 | Runtime failure (file write, astro-check error, etc.) |
| 2 | Usage error (bad flag, missing required arg in non-interactive) |
| 130 | User cancelled (Ctrl+C / clack `isCancel`) |

## 5. Architecture (fits existing layered rules)

```
domain/
  wizard/
    answers.ts          WizardAnswers value type, DefaultAnswers (subset of WizardAnswers — the values the wizard pre-fills), WizardCancelled tag type
    plan.ts             ConversionPlan (output of explain → input to Tier 1 logic)
    ports/
      prompter.ts       Prompter port — text, select, multiselect, confirm, group, spinner, note, intro, outro, cancel

use-cases/
  wizard/
    run-wizard.ts       Pure orchestrator. Takes Prompter + ConversionPlan + DefaultAnswers, returns Result<WizardAnswers, WizardCancelled>
    derive-defaults.ts  Pure: from parsed mkdocs.yml + env, compute DefaultAnswers (Tier 0: output dir name, package manager guess; Tier 1/2: the converter's current default behavior — all toggles in their existing positions, so the wizard with no overrides === today's `--yes` run)
    answers-to-flags.ts Pure: WizardAnswers → equivalent flag list (used by --json plan output and for "here's the equivalent command" copy-paste)
    tier1-trigger.ts    Pure: which Tier 1 prompts fire given the ConversionPlan

infrastructure/
  prompts/
    clack-prompter.ts   Adapter implementing Prompter using @clack/prompts + picocolors. Lazy-loaded.
  env/
    tty-detection.ts    Pure-ish wrapper around process.{stdin,stdout}.isTTY + NO_COLOR/FORCE_COLOR/CI

interface/
  cli/
    bin.ts              (unchanged thin shell)
    main.ts             gains wizard branch
    parse-args.ts       REPLACED by parse-args-v2.ts using Node util.parseArgs
    parse-args-v2.ts    Returns the same Command discriminated union; strict mode + short aliases
    wizard-runner.ts    Wires clack-prompter (lazy import) into run-wizard, then converts WizardAnswers → ConvertCommand and re-enters runConvert
```

### Boundary discipline

- `domain/wizard/` imports stdlib only.
- `use-cases/wizard/` imports `domain/`. **No imports of @clack/prompts** — it never sees terminal types.
- `infrastructure/prompts/clack-prompter.ts` is the only place @clack/prompts and picocolors are imported.
- `interface/cli/wizard-runner.ts` is the only place that wires the clack adapter in.

### Library-first

- **Argument parsing:** Node 20+ `node:util` `parseArgs` (zero deps; replaces hand-rolled `parse-args.ts`). Strict mode catches typos.
- **Prompts:** `@clack/prompts` (lazy-imported).
- **Color:** `picocolors` (lazy-imported by the clack adapter).
- **TTY/env:** stdlib (`process.stdout.isTTY`, `process.env`).

No new transitive deps beyond `@clack/prompts` and `picocolors`. Both are tiny, both are ESM-first, both target Node ≥18.

## 6. Test strategy (TDD non-negotiable per CLAUDE.md)

### Pure layer (`use-cases/wizard/`, `domain/wizard/`)

- `run-wizard.test.ts` — feeds a `FakePrompter` (returns scripted answers), asserts the returned `WizardAnswers` shape and the order of prompts called.
- Property test: for every `ConversionPlan` shape from the existing fixture corpus, `runWizard(plan, fakePrompterAcceptingDefaults) → answers` produces a `WizardAnswers` equal to `defaultAnswers(plan)`. (Idempotency-style invariant: wizard with all-default answers === `--yes` flag run.)
- `tier1-trigger.test.ts` — exhaustive coverage of the conditional matrix: every (plugin/feature) → (prompt fires y/n) combination.
- `answers-to-flags.test.ts` — round-trip: `parseArgs(answersToFlags(answers)) === answersAsCommand(answers)`. Guarantees flag surface and wizard surface stay equivalent.
- `derive-defaults.test.ts` — package manager guess from `npm_config_user_agent`, output dir name from `site_name`, etc.

### Adapter (`infrastructure/prompts/clack-prompter.ts`)

- One smoke test: import the adapter, assert it implements every `Prompter` method (no functional assertion — clack itself is tested upstream).

### Parser (`interface/cli/parse-args-v2.ts`)

- Existing `parse-args.test.ts` cases ported verbatim. New cases: short aliases (`-y`, `-f`, `-q`, `-C`, `-n`), `--no-foo` negation, env-var precedence resolution.

### Integration (`tests/integration/`)

- `wizard-non-interactive.test.ts` — set `process.env.CI=1`, missing required args → expect exit 2 with message naming required flags.
- `wizard-yes-mode.test.ts` — `--yes` + a fixture `mkdocs.yml`, no TTY → produces same output as wizard's default-everything path.
- `force-overwrite.test.ts` — pre-populated output dir + `--force` → succeeds; without `--force` in non-interactive → exit 1.

### Idempotency property test (existing CI invariant extends)

The wizard's `--yes` path participates in the existing `convert(convert(x)) === convert(x)` property test on the fixture corpus.

## 7. Diagnostics integration

Wizard answers that disable a default behavior (e.g., `--no-links-validator`, `--no-rss`) emit an info-level diagnostic into `MIGRATION_NOTES.md` recording the choice. This makes runs reproducible even when the wizard wasn't used:

> *"Configured: `starlight-links-validator` was disabled via `--no-links-validator` (default is enabled). To re-enable, remove the flag and reconvert."*

Three new `ruleId`s land in `domain/diagnostics/registry.ts`:
- `wizard-decision-applied` (info) — generic record of a non-default wizard choice
- `wizard-non-interactive-fallback` (info) — wizard skipped because non-TTY/CI
- `wizard-cancelled` (info) — only emitted in the `--dry-run`/`--json` report path; never in actual runs (cancelled run = exit 130, no output)

## 8. UX details

- **Intro:** `intro(picocolors.bgCyan(' mkdocs-to-starlight '))` + a one-line description.
- **Outro:** `outro('Done. Next: cd <out-dir> && <pm> install && <pm> run dev')`. The `<pm>` placeholder uses the picked package manager. Non-interactive `--yes` mode emits the same line through stderr.
- **Spinner:** wraps the actual conversion call (the slow part) with `spinner()`; `succeed`/`fail` on completion. The pre-pass `--explain` is fast enough to skip the spinner.
- **Hyperlinks:** OSC 8 hyperlinks for documentation references (e.g., the Starlight config docs link in the outro). Falls back to plain URLs in non-supporting terminals.
- **No emoji.** Per project convention (CLAUDE.md: "Only use emojis if the user explicitly requests it").

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| @clack/prompts breaking change | Adapter isolates the import; switching to a fork or alternative is one file change. |
| `util.parseArgs` strictness rejects existing valid invocations | Port every `parse-args.test.ts` case verbatim; CI catches regressions. |
| Wizard hides the existing `--explain` (users don't discover it) | `--help` lists `--explain` and the wizard prints "(equivalent flags: …)" in `--dry-run` mode. |
| Non-interactive in CI without `--yes` silently picks defaults | Explicit `--ci` flag + auto CI-detection both *fail fast* with "use --yes to accept defaults" message. |
| Adding 25+ new flags bloats `--help` | Group help into sections (Convert / Output / Wizard / Advanced); short `--help` shows Tier 0+1 only, `--help advanced` shows all. |
| `picocolors` doesn't honor `FORCE_COLOR=0` consistently across versions | Detection lives in our `tty-detection.ts`; we pass a resolved bool to the adapter, never let picocolors auto-detect. |

## 10. Migration order (for the implementation plan)

1. Replace `parse-args.ts` with `parse-args-v2.ts` (util.parseArgs) — same `Command` output, all existing tests green. **Pre-req for everything else; no behavior change.**
2. Add `domain/wizard/` types + `Prompter` port. Tests for the port shape only (interface check).
3. Add `use-cases/wizard/derive-defaults.ts`, `tier1-trigger.ts`, `answers-to-flags.ts` (pure, fully tested).
4. Add `use-cases/wizard/run-wizard.ts` orchestrator with `FakePrompter` tests.
5. Add new flags to `parse-args-v2.ts` + `Command` types. Tests: parse → command, command → equivalent flags.
6. Wire new flags into `convert-site.ts` API (the actual behavior changes — new options on `ConvertSiteFromDiskInput`).
7. Add `infrastructure/prompts/clack-prompter.ts` adapter + smoke test.
8. Add `infrastructure/env/tty-detection.ts` + tests.
9. Add `interface/cli/wizard-runner.ts` and the wizard branch in `main.ts`. Integration tests for the three CI/TTY scenarios.
10. Update `package.json` deps (`@clack/prompts`, `picocolors`) and bump version.
11. Update README with wizard demo + flag reference.

Each step lands as its own PR-shaped commit, each green on `npm test && npm run typecheck && npm run build`.

## 11. Open questions (none blocking — note for implementation phase)

- Should `--json` be allowed *with* the wizard (i.e., wizard collects answers, then JSON plan is emitted instead of running)? Lean: yes, with explicit `--dry-run --json` combo.
- Do we want a `--profile=<name>` shorthand that bundles common Tier-2 selections (e.g., `--profile=fastapi` for the FastAPI-style migration)? Lean: defer to v2 once we see real usage patterns.

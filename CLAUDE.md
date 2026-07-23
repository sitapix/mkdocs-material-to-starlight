# CLAUDE.md

Working agreement for this repo. The README covers what the tool does; this
file covers how to change it safely.

## Commands

```bash
npm test                # full vitest suite (~5s test time)
npm run typecheck       # tsc --noEmit
npm run check:ci        # biome ci (lint + import sorting) — CI release gate
npm run knip            # unused exports/deps — CI release gate
npm run audit:release   # npm audit --omit=dev --audit-level=moderate — release gate
npm run build           # emit dist/ (regen-fixtures and the CLI run from dist)
npx vitest run path/to/file.test.ts   # single file
```

Never pipe a gate command through `tail`/`grep`/`head` inside a `&&` chain —
the pipe masks the exit code. A v0.4.0 release failed in CI on a biome error
that a `| tail -1` had hidden locally.

## Architecture

Functional core, imperative shell. Layer rules live in each layer's README:
`src/domain/` (pure types, ports; no I/O), `src/use-cases/` (pure
orchestration), `src/infrastructure/` (adapters; the only place that touches
fs/process/network), `src/interface/` (CLI + API; the only place that wires
concrete adapters). Imports only point inward — biome and the tests enforce
most of it, the READMEs document the rest.

Invariants the test suite enforces:

- **Idempotent**: `convert(convert(x)) === convert(x)` byte-equal, at every
  level from unit to CLI.
- **Diagnostic-first**: user-input failures become typed diagnostics, never
  throws. Every emitted `ruleId` MUST be registered in
  `src/domain/diagnostics/registry.ts` (a registry test fails otherwise).
- **Deterministic output**: sorted keys, stable field order — reruns must not
  churn diffs.

## Generated-project dependencies

Every version pinned into a generated `package.json` lives in
`src/use-cases/serialize-config/versions.ts` — one file, one diff per refresh.
When refreshing:

1. `npm view <pkg> version peerDependencies` for the whole set; the astro
   major is gated by `@astrojs/starlight`'s peer.
2. Prove resolution with a dry-run install of an all-features package.json.
3. Field-test (below) before releasing.
4. Record WHY for every hold or rejection as a comment in `versions.ts`
   (see contributor-list, astro-plantuml, starlight-md-txt for the pattern).

Plugin export shapes vary — check before emitting an import
(`starlight-base-path` is a named export; its siblings are defaults).

## Field-testing (do this for converter-behavior changes)

`tests/fixtures/real-world/` holds local-only clones (gitignored; see its
README). The loop:

```bash
git clone --depth=1 https://github.com/encode/httpx tests/fixtures/real-world/httpx
npm run build && node scripts/regen-fixtures.mjs httpx
cd tests/fixtures/real-world/httpx-out && npm install && npx astro build
```

A real `astro build` catches what unit tests cannot (plugin hard-errors,
schema validation, peer conflicts). httpx is small/fast;
squidfunk/mkdocs-material exercises nearly every feature at once (tabs, blog,
math, custom admonitions, subpath site_url). Regen preserves `node_modules`.

## Releasing

Conventional commits. Release = bump `package.json`, commit
`chore: release vX.Y.Z`, tag `vX.Y.Z`, push tag — CI publishes to npm after
running the full gate set (including `audit:release`, so run it locally
first). If the workflow fails before publish, fix forward and move the tag.

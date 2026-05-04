# Interactive Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tiered, conditional `@clack/prompts` wizard launched by `npx mkdocs-material-to-starlight` (zero args), backed by a POSIX-compliant flag surface that reproduces every wizard answer for unattended/CI use.

**Architecture:** Pure orchestrator in `use-cases/wizard/` driven by a `Prompter` port (`domain/wizard/ports/prompter.ts`); clack adapter is the only side-effecting module and is lazy-imported. Hand-rolled `parse-args.ts` is replaced with Node 20's `node:util` `parseArgs` (zero deps, free short aliases). Every wizard answer maps 1:1 to a flag, so `--yes` runs unattended produce the same output as wizard defaults.

**Tech Stack:** TypeScript 5.3+ (strict, ESM), Node ≥20 (`util.parseArgs`), `@clack/prompts`, `picocolors`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-02-interactive-wizard-design.md`

---

## File structure

```
src/
├── domain/
│   └── wizard/
│       ├── answers.ts              WizardAnswers, DefaultAnswers, WizardCancelled
│       ├── plan.ts                 ConversionPlan re-export shape (subset of explainConversion output)
│       └── ports/
│           └── prompter.ts         Prompter port + prompt option types
├── use-cases/
│   └── wizard/
│       ├── derive-defaults.ts      mkdocs.yml + env → DefaultAnswers
│       ├── derive-defaults.test.ts
│       ├── tier1-trigger.ts        ConversionPlan → which Tier 1 prompts fire
│       ├── tier1-trigger.test.ts
│       ├── answers-to-flags.ts     WizardAnswers → string[] argv equivalent
│       ├── answers-to-flags.test.ts
│       ├── run-wizard.ts           Orchestrator over Prompter
│       └── run-wizard.test.ts
├── infrastructure/
│   ├── env/
│   │   ├── tty-detection.ts        process.env + isTTY → InteractivityDecision
│   │   └── tty-detection.test.ts
│   └── prompts/
│       ├── clack-prompter.ts       Adapter, lazy-loadable
│       └── clack-prompter.smoke.test.ts
└── interface/
    └── cli/
        ├── parse-args.ts           REPLACED — same Command output, util.parseArgs internals + new flags
        ├── parse-args.test.ts      EXPANDED — original cases + new flag cases
        ├── wizard-runner.ts        Wires lazy clack adapter + tty-detection into runWizard, branches on result
        ├── wizard-runner.test.ts
        └── main.ts                 MODIFIED — empty argv + TTY → wizard branch; --json mode

tests/integration/
├── wizard-yes-mode.test.ts         --yes against fixture mkdocs site, no TTY
├── wizard-non-interactive.test.ts  CI=1, missing required arg → exit 2 with guidance
└── wizard-force-overwrite.test.ts  Pre-populated outDir + --force succeeds; without it fails
```

Each task below is one source unit + its tests + a single commit. Steps are bite-sized (2–5 min each).

---

## Task 1: Replace parse-args.ts internals with `util.parseArgs` (no behavior change)

**Why first:** every later task adds flags. The new parser must support short aliases (`-y`, `-f`, `-q`, `-C`, `-n`) and `--no-foo` negation, both of which the hand-rolled parser doesn't. Behavior preserved by porting every existing test verbatim.

**Files:**
- Modify: `src/interface/cli/parse-args.ts` (full rewrite)
- Modify: `src/interface/cli/parse-args.test.ts` (existing cases stay; one new case for `-h` short alias parity)

- [ ] **Step 1.1: Snapshot existing test output**

Run: `npx vitest run src/interface/cli/parse-args.test.ts`
Expected: 18 tests pass.

Record this baseline — every test must still pass after the rewrite.

- [ ] **Step 1.2: Add a single failing test for short-alias `-y` (used in later tasks but parser must already accept it)**

Append to `src/interface/cli/parse-args.test.ts`:

```typescript
  it('accepts -y as a no-op short alias to be used by later wizard work', () => {
    // -y currently sets no field but must not cause an "unknown option" error.
    const result = parseArgs(['./project', './output', '-y']);
    expect(result.kind).toBe('convert');
  });
```

- [ ] **Step 1.3: Run the new test to confirm it fails**

Run: `npx vitest run src/interface/cli/parse-args.test.ts -t '-y as a no-op'`
Expected: FAIL — current parser reports unknown option `-y`.

- [ ] **Step 1.4: Rewrite `src/interface/cli/parse-args.ts` using `util.parseArgs`**

Full replacement file:

```typescript
/**
 * CLI argument parser. Built on Node 20's `node:util` `parseArgs` for strict
 * POSIX-style parsing with short aliases and `--no-*` negation.
 *
 * Pure: no side effects, no `process` access, no console output. Returns a
 * tagged `Command` describing what to do; the CLI shell dispatches.
 */

import { parseArgs as nodeParseArgs } from 'node:util';

export type Command =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | { readonly kind: 'error'; readonly message: string }
  | {
      readonly kind: 'convert';
      readonly projectDir: string;
      readonly outputDir: string;
      readonly snippetBasePaths: ReadonlyArray<string> | null;
      readonly dryRun: boolean;
      readonly check: boolean;
      readonly checkTimeoutMs: number | null;
    }
  | { readonly kind: 'explain'; readonly projectDir: string }
  | {
      readonly kind: 'compare';
      readonly baselineUrl: string;
      readonly convertedUrl: string;
      readonly paths: ReadonlyArray<string>;
      readonly threshold: number;
      readonly reportPath: string | null;
    };

const CONVERT_OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
  'snippet-base-path': { type: 'string', multiple: true },
  'dry-run': { type: 'boolean' },
  explain: { type: 'boolean' },
  check: { type: 'boolean' },
  'check-timeout': { type: 'string' },
  yes: { type: 'boolean', short: 'y' }, // reserved for wizard tasks; no-op here
} as const;

const COMPARE_OPTIONS = {
  pages: { type: 'string' },
  threshold: { type: 'string' },
  report: { type: 'string' },
} as const;

export function parseArgs(argv: ReadonlyArray<string>): Command {
  if (argv.length === 0) {
    return { kind: 'error', message: 'missing project directory' };
  }
  if (argv[0] === 'compare') {
    return parseCompareArgs(argv.slice(1));
  }
  return parseConvertArgs(argv);
}

function parseConvertArgs(argv: ReadonlyArray<string>): Command {
  let parsed: ReturnType<typeof nodeParseArgs<typeof CONVERT_OPTIONS>>;
  try {
    parsed = nodeParseArgs({
      args: [...argv],
      options: CONVERT_OPTIONS,
      allowPositionals: true,
      strict: true,
    });
  } catch (cause) {
    return { kind: 'error', message: extractParseError(cause) };
  }

  if (parsed.values.help === true) return { kind: 'help' };
  if (parsed.values.version === true) return { kind: 'version' };

  const positionals = parsed.positionals;
  if (parsed.values.explain === true) {
    if (positionals.length < 1) {
      return { kind: 'error', message: 'missing project directory' };
    }
    return { kind: 'explain', projectDir: positionals[0] ?? '' };
  }

  if (positionals.length < 1) {
    return { kind: 'error', message: 'missing project directory' };
  }
  if (positionals.length < 2) {
    return { kind: 'error', message: 'missing output directory' };
  }

  const checkTimeoutRaw = parsed.values['check-timeout'];
  let checkTimeoutMs: number | null = null;
  if (checkTimeoutRaw !== undefined) {
    const n = Number(checkTimeoutRaw);
    if (!Number.isFinite(n) || n <= 0) {
      return {
        kind: 'error',
        message: `--check-timeout must be a positive number of milliseconds (got "${checkTimeoutRaw}")`,
      };
    }
    checkTimeoutMs = n;
  }

  const snippetBasePathsRaw = parsed.values['snippet-base-path'];
  const snippetBasePaths =
    snippetBasePathsRaw === undefined || snippetBasePathsRaw.length === 0
      ? null
      : (snippetBasePathsRaw as ReadonlyArray<string>);

  return {
    kind: 'convert',
    projectDir: positionals[0] ?? '',
    outputDir: positionals[1] ?? '',
    snippetBasePaths,
    dryRun: parsed.values['dry-run'] === true,
    check: parsed.values.check === true,
    checkTimeoutMs,
  };
}

function parseCompareArgs(argv: ReadonlyArray<string>): Command {
  let parsed: ReturnType<typeof nodeParseArgs<typeof COMPARE_OPTIONS>>;
  try {
    parsed = nodeParseArgs({
      args: [...argv],
      options: COMPARE_OPTIONS,
      allowPositionals: true,
      strict: true,
    });
  } catch (cause) {
    return { kind: 'error', message: extractParseError(cause) };
  }

  const positionals = parsed.positionals;
  if (positionals.length < 2) {
    return {
      kind: 'error',
      message: 'compare requires <baseline-url> and <converted-url>',
    };
  }

  let threshold = 0.01;
  if (parsed.values.threshold !== undefined) {
    const n = Number(parsed.values.threshold);
    if (!Number.isFinite(n) || n < 0 || n > 1) {
      return {
        kind: 'error',
        message: `--threshold must be a number between 0 and 1 (got "${parsed.values.threshold}")`,
      };
    }
    threshold = n;
  }

  const paths: string[] = [];
  if (parsed.values.pages !== undefined) {
    for (const p of parsed.values.pages.split(',')) {
      const trimmed = p.trim();
      if (trimmed.length > 0) paths.push(trimmed);
    }
  }
  if (paths.length === 0) paths.push('/');

  return {
    kind: 'compare',
    baselineUrl: positionals[0] ?? '',
    convertedUrl: positionals[1] ?? '',
    paths,
    threshold,
    reportPath: parsed.values.report ?? null,
  };
}

function extractParseError(cause: unknown): string {
  if (cause instanceof Error) {
    // node:util parseArgs throws ERR_PARSE_ARGS_UNKNOWN_OPTION etc.
    return cause.message.replace(/^.*?: /, '').replace(/\.\s*$/, '');
  }
  return String(cause);
}
```

- [ ] **Step 1.5: Run the full parse-args test file**

Run: `npx vitest run src/interface/cli/parse-args.test.ts`
Expected: all 19 tests pass (18 original + the new `-y` no-op case).

- [ ] **Step 1.6: Run the broader CLI test suite to confirm `main.ts` still consumes `Command` correctly**

Run: `npx vitest run src/interface/cli/`
Expected: all CLI tests pass.

- [ ] **Step 1.7: Commit**

```bash
git add src/interface/cli/parse-args.ts src/interface/cli/parse-args.test.ts
git commit -m "refactor(cli): swap hand-rolled parser for node:util parseArgs"
```

---

## Task 2: domain/wizard types

**Files:**
- Create: `src/domain/wizard/answers.ts`
- Create: `src/domain/wizard/plan.ts`
- Create: `src/domain/wizard/ports/prompter.ts`
- Create: `src/domain/wizard/answers.test.ts`

- [ ] **Step 2.1: Write the failing test asserting type construction**

Create `src/domain/wizard/answers.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  WIZARD_CANCELLED,
  type DefaultAnswers,
  type WizardAnswers,
} from './answers.js';

describe('WizardAnswers', () => {
  it('accepts a fully-specified value', () => {
    const a: WizardAnswers = {
      projectDir: '/p',
      outputDir: '/o',
      packageManager: 'npm',
      check: true,
      tabs: 'mdx',
      sidebarTopics: false,
      rss: true,
      mikeVersions: [],
      palette: 'translate',
      extraAssets: [],
      locales: [],
      snippetBasePaths: [],
      snippetMaxDepth: 8,
      snippetDedentSubsections: false,
      linksValidator: true,
      expressiveCodeTheme: null,
      cards: 'html',
      mdxMode: 'auto',
      logoReplacesTitle: false,
      admonitionMapPath: null,
      keepExplicitHeadingIds: false,
      smartSymbols: true,
      emojiShortcodes: true,
      inlineMarks: true,
      autoAppend: true,
      suppressRules: [],
      configFormat: 'mjs',
      packageName: null,
    };
    expect(a.projectDir).toBe('/p');
  });

  it('exposes WIZARD_CANCELLED as a tagged sentinel', () => {
    expect(WIZARD_CANCELLED).toEqual({ tag: 'wizard-cancelled' });
  });

  it('DefaultAnswers is a subset of WizardAnswers (no projectDir/outputDir)', () => {
    const d: DefaultAnswers = {
      packageManager: 'pnpm',
      check: true,
      tabs: 'mdx',
      sidebarTopics: true,
      rss: true,
      mikeVersions: [],
      palette: 'translate',
      extraAssets: [],
      locales: [],
      snippetBasePaths: [],
      snippetMaxDepth: 8,
      snippetDedentSubsections: false,
      linksValidator: true,
      expressiveCodeTheme: null,
      cards: 'html',
      mdxMode: 'auto',
      logoReplacesTitle: false,
      admonitionMapPath: null,
      keepExplicitHeadingIds: false,
      smartSymbols: true,
      emojiShortcodes: true,
      inlineMarks: true,
      autoAppend: true,
      suppressRules: [],
      configFormat: 'mjs',
      packageName: null,
    };
    expect(d.packageManager).toBe('pnpm');
  });
});
```

- [ ] **Step 2.2: Run the test to confirm it fails**

Run: `npx vitest run src/domain/wizard/answers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Create `src/domain/wizard/answers.ts`**

```typescript
/**
 * Wizard answers: the typed result of running the interactive prompts
 * (or, equivalently, the parsed combination of CLI flags).
 *
 * `WizardAnswers` is the union of every decision the converter exposes.
 * `DefaultAnswers` is the same shape minus the two positional inputs
 * (project + output dir) — it represents what the wizard *pre-fills* before
 * the user touches anything.
 *
 * `WIZARD_CANCELLED` is the typed cancellation sentinel returned via the
 * `Result<…, WizardCancelled>` channel from the orchestrator. The interface
 * layer is the only consumer that observes it and translates to exit 130.
 */

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type TabsStrategy = 'mdx' | 'html';
export type PaletteStrategy = 'translate' | 'skip' | 'custom';
export type CardsStrategy = 'mdx' | 'html' | 'skip';
export type MdxMode = 'auto' | 'always' | 'never';
export type ConfigFormat = 'mjs' | 'ts';

export interface WizardAnswers {
  // Tier 0 (positional/required)
  readonly projectDir: string;
  readonly outputDir: string;
  // Tier 0 (always asked)
  readonly packageManager: PackageManager;
  readonly check: boolean;
  // Tier 1 (conditional on detected features)
  readonly tabs: TabsStrategy;
  readonly sidebarTopics: boolean;
  readonly rss: boolean;
  readonly mikeVersions: ReadonlyArray<string>;
  readonly palette: PaletteStrategy;
  readonly extraAssets: ReadonlyArray<string>;
  readonly locales: ReadonlyArray<string>;
  readonly snippetBasePaths: ReadonlyArray<string>;
  readonly snippetMaxDepth: number;
  readonly snippetDedentSubsections: boolean;
  // Tier 2 (advanced)
  readonly linksValidator: boolean;
  readonly expressiveCodeTheme: string | null;
  readonly cards: CardsStrategy;
  readonly mdxMode: MdxMode;
  readonly logoReplacesTitle: boolean;
  readonly admonitionMapPath: string | null;
  readonly keepExplicitHeadingIds: boolean;
  readonly smartSymbols: boolean;
  readonly emojiShortcodes: boolean;
  readonly inlineMarks: boolean;
  readonly autoAppend: boolean;
  readonly suppressRules: ReadonlyArray<string>;
  readonly configFormat: ConfigFormat;
  readonly packageName: string | null;
}

export type DefaultAnswers = Omit<WizardAnswers, 'projectDir' | 'outputDir'>;

export interface WizardCancelled {
  readonly tag: 'wizard-cancelled';
}
export const WIZARD_CANCELLED: WizardCancelled = { tag: 'wizard-cancelled' };
```

- [ ] **Step 2.4: Create `src/domain/wizard/plan.ts`**

```typescript
/**
 * The pre-pass conversion plan handed to the wizard so it knows which Tier 1
 * prompts to fire. A subset of what `explainConversion` returns plus the raw
 * mkdocs config view the wizard needs to compute conditional triggers.
 */

import type { MkdocsConfig } from '../config/mkdocs-config.js';
import type { MappingRow } from '../conversion-mapping/table.js';

export interface ConversionPlan {
  readonly config: MkdocsConfig;
  readonly mappingRows: ReadonlyArray<MappingRow>;
  readonly detectedExtraCss: ReadonlyArray<string>;
  readonly detectedExtraJs: ReadonlyArray<string>;
  readonly detectedLocales: ReadonlyArray<string>;
  readonly snippetCandidateDirs: ReadonlyArray<string>;
}
```

- [ ] **Step 2.5: Create `src/domain/wizard/ports/prompter.ts`**

```typescript
/**
 * Prompter port — the abstract surface the wizard orchestrator drives.
 * Implementations live in `infrastructure/prompts/`.
 *
 * Methods return `null` to signal user cancellation (Ctrl+C). The orchestrator
 * translates `null` to `Result.err(WIZARD_CANCELLED)`.
 *
 * No method throws on cancellation. Implementations swallow errors and return
 * `null`; programmer errors (invalid option shape) may still throw.
 */

export interface SelectChoice<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly hint?: string;
}

export interface TextOptions {
  readonly message: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
  readonly validate?: (value: string) => string | undefined;
}

export interface ConfirmOptions {
  readonly message: string;
  readonly initialValue?: boolean;
}

export interface SelectOptions<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectChoice<V>>;
  readonly initialValue?: V;
}

export interface MultiselectOptions<V extends string> {
  readonly message: string;
  readonly options: ReadonlyArray<SelectChoice<V>>;
  readonly initialValues?: ReadonlyArray<V>;
  readonly required?: boolean;
}

export interface Prompter {
  intro(title: string): void;
  outro(message: string): void;
  note(body: string, title?: string): void;
  text(options: TextOptions): Promise<string | null>;
  confirm(options: ConfirmOptions): Promise<boolean | null>;
  select<V extends string>(options: SelectOptions<V>): Promise<V | null>;
  multiselect<V extends string>(
    options: MultiselectOptions<V>,
  ): Promise<ReadonlyArray<V> | null>;
}
```

- [ ] **Step 2.6: Run the test**

Run: `npx vitest run src/domain/wizard/answers.test.ts`
Expected: PASS.

- [ ] **Step 2.7: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 2.8: Commit**

```bash
git add src/domain/wizard/
git commit -m "feat(wizard): add domain types — WizardAnswers, ConversionPlan, Prompter port"
```

---

## Task 3: `derive-defaults.ts` — pure mkdocs.yml + env → DefaultAnswers

**Files:**
- Create: `src/use-cases/wizard/derive-defaults.ts`
- Create: `src/use-cases/wizard/derive-defaults.test.ts`

- [ ] **Step 3.1: Write the failing tests**

Create `src/use-cases/wizard/derive-defaults.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { deriveDefaults, guessPackageManager } from './derive-defaults.js';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';

const baseConfig: MkdocsConfig = {
  siteName: 'My Docs',
  siteDescription: null,
  siteUrl: null,
  docsDir: 'docs',
  repoUrl: null,
  editUri: null,
  nav: [],
  theme: null,
  plugins: [],
  markdownExtensions: [],
  extras: { record: {}, hooks: null },
};

describe('deriveDefaults', () => {
  it('produces all defaults equal to today\'s converter behavior (no overrides)', () => {
    const d = deriveDefaults(baseConfig, { userAgent: undefined, env: {} });
    expect(d.check).toBe(true);
    expect(d.tabs).toBe('mdx');
    expect(d.sidebarTopics).toBe(true);
    expect(d.rss).toBe(true);
    expect(d.mikeVersions).toEqual([]);
    expect(d.palette).toBe('translate');
    expect(d.extraAssets).toEqual([]);
    expect(d.locales).toEqual([]);
    expect(d.snippetBasePaths).toEqual([]);
    expect(d.snippetMaxDepth).toBe(8);
    expect(d.snippetDedentSubsections).toBe(false);
    expect(d.linksValidator).toBe(true);
    expect(d.expressiveCodeTheme).toBeNull();
    expect(d.cards).toBe('html');
    expect(d.mdxMode).toBe('auto');
    expect(d.logoReplacesTitle).toBe(false);
    expect(d.admonitionMapPath).toBeNull();
    expect(d.keepExplicitHeadingIds).toBe(false);
    expect(d.smartSymbols).toBe(true);
    expect(d.emojiShortcodes).toBe(true);
    expect(d.inlineMarks).toBe(true);
    expect(d.autoAppend).toBe(true);
    expect(d.suppressRules).toEqual([]);
    expect(d.configFormat).toBe('mjs');
    expect(d.packageName).toBeNull();
  });
});

describe('guessPackageManager', () => {
  it('returns npm when npm_config_user_agent is missing', () => {
    expect(guessPackageManager(undefined)).toBe('npm');
  });

  it('detects pnpm', () => {
    expect(guessPackageManager('pnpm/8.6.0 npm/? node/v20.0.0 darwin x64')).toBe(
      'pnpm',
    );
  });

  it('detects yarn', () => {
    expect(guessPackageManager('yarn/3.6.0 npm/? node/v20.0.0 linux x64')).toBe(
      'yarn',
    );
  });

  it('detects bun', () => {
    expect(guessPackageManager('bun/1.0.0 npm/? node/v20.0.0 darwin arm64')).toBe(
      'bun',
    );
  });

  it('falls back to npm for unrecognized agents', () => {
    expect(guessPackageManager('something-weird/1.0')).toBe('npm');
  });
});
```

- [ ] **Step 3.2: Run the tests to confirm they fail**

Run: `npx vitest run src/use-cases/wizard/derive-defaults.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Create `src/use-cases/wizard/derive-defaults.ts`**

```typescript
/**
 * Compute DefaultAnswers from a parsed mkdocs config + the runtime env.
 *
 * Pure: no I/O, no `process.*` access. The caller passes `process.env` and
 * `process.env.npm_config_user_agent` explicitly so this function is trivially
 * testable.
 *
 * The defaults intentionally reproduce the converter's *current* behavior
 * (links validator on, palette translate, tabs MDX-when-detected, etc.) so
 * `--yes` on a fresh install equals "what we shipped before this wizard."
 */

import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import type {
  DefaultAnswers,
  PackageManager,
} from '../../domain/wizard/answers.js';

export interface DeriveDefaultsContext {
  readonly userAgent: string | undefined;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export function deriveDefaults(
  _config: MkdocsConfig,
  ctx: DeriveDefaultsContext,
): DefaultAnswers {
  return {
    packageManager: guessPackageManager(ctx.userAgent),
    check: true,
    tabs: 'mdx',
    sidebarTopics: true,
    rss: true,
    mikeVersions: [],
    palette: 'translate',
    extraAssets: [],
    locales: [],
    snippetBasePaths: [],
    snippetMaxDepth: 8,
    snippetDedentSubsections: false,
    linksValidator: true,
    expressiveCodeTheme: null,
    cards: 'html',
    mdxMode: 'auto',
    logoReplacesTitle: false,
    admonitionMapPath: null,
    keepExplicitHeadingIds: false,
    smartSymbols: true,
    emojiShortcodes: true,
    inlineMarks: true,
    autoAppend: true,
    suppressRules: [],
    configFormat: 'mjs',
    packageName: null,
  };
}

export function guessPackageManager(
  userAgent: string | undefined,
): PackageManager {
  if (userAgent === undefined) return 'npm';
  if (userAgent.startsWith('pnpm/')) return 'pnpm';
  if (userAgent.startsWith('yarn/')) return 'yarn';
  if (userAgent.startsWith('bun/')) return 'bun';
  return 'npm';
}

export function deriveOutputDirName(siteName: string): string {
  const slug = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `./${slug || 'starlight-docs'}-starlight`;
}
```

- [ ] **Step 3.4: Run the tests**

Run: `npx vitest run src/use-cases/wizard/derive-defaults.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3.5: Commit**

```bash
git add src/use-cases/wizard/derive-defaults.ts src/use-cases/wizard/derive-defaults.test.ts
git commit -m "feat(wizard): derive defaults from mkdocs config + npm_config_user_agent"
```

---

## Task 4: `tier1-trigger.ts` — which conditional prompts fire

**Files:**
- Create: `src/use-cases/wizard/tier1-trigger.ts`
- Create: `src/use-cases/wizard/tier1-trigger.test.ts`

- [ ] **Step 4.1: Write the failing tests**

Create `src/use-cases/wizard/tier1-trigger.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { triggerSet, type Tier1Trigger } from './tier1-trigger.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';

function plan(over: Partial<MkdocsConfig> = {}): ConversionPlan {
  const config: MkdocsConfig = {
    siteName: 's',
    siteDescription: null,
    siteUrl: null,
    docsDir: 'docs',
    repoUrl: null,
    editUri: null,
    nav: [],
    theme: null,
    plugins: [],
    markdownExtensions: [],
    extras: { record: {}, hooks: null },
    ...over,
  };
  return {
    config,
    mappingRows: [],
    detectedExtraCss: [],
    detectedExtraJs: [],
    detectedLocales: [],
    snippetCandidateDirs: [],
  };
}

describe('triggerSet', () => {
  it('fires nothing on a vanilla mkdocs site', () => {
    expect(triggerSet(plan())).toEqual([]);
  });

  it('fires "tabs" when content.tabs.link is in theme.features', () => {
    const p = plan({
      theme: { name: 'material', options: { features: ['content.tabs.link'] } },
    });
    expect(triggerSet(p)).toContain<Tier1Trigger>('tabs');
  });

  it('fires "sidebar-topics" when navigation.tabs is in theme.features', () => {
    const p = plan({
      theme: { name: 'material', options: { features: ['navigation.tabs'] } },
    });
    expect(triggerSet(p)).toContain<Tier1Trigger>('sidebar-topics');
  });

  it('fires "snippets" when pymdownx.snippets extension is configured', () => {
    const p = plan({
      markdownExtensions: [{ name: 'pymdownx.snippets', options: {} }],
    });
    expect(triggerSet(p)).toContain<Tier1Trigger>('snippets');
  });

  it('fires "rss" when rss plugin is present', () => {
    const p = plan({ plugins: [{ name: 'rss', options: {} }] });
    expect(triggerSet(p)).toContain<Tier1Trigger>('rss');
  });

  it('fires "i18n" when i18n plugin is present', () => {
    const p = plan({ plugins: [{ name: 'i18n', options: {} }] });
    expect(triggerSet(p)).toContain<Tier1Trigger>('i18n');
  });

  it('fires "mike" when mike plugin is present', () => {
    const p = plan({ plugins: [{ name: 'mike', options: {} }] });
    expect(triggerSet(p)).toContain<Tier1Trigger>('mike');
  });

  it('fires "palette" when theme.palette is set', () => {
    const p = plan({
      theme: { name: 'material', options: { palette: { primary: 'blue' } } },
    });
    expect(triggerSet(p)).toContain<Tier1Trigger>('palette');
  });

  it('fires "extra-assets" when extra_css or extra_javascript is non-empty', () => {
    const p = plan();
    const withCss = { ...p, detectedExtraCss: ['custom.css'] };
    expect(triggerSet(withCss)).toContain<Tier1Trigger>('extra-assets');
    const withJs = { ...p, detectedExtraJs: ['custom.js'] };
    expect(triggerSet(withJs)).toContain<Tier1Trigger>('extra-assets');
  });
});
```

- [ ] **Step 4.2: Run the tests to confirm they fail**

Run: `npx vitest run src/use-cases/wizard/tier1-trigger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Create `src/use-cases/wizard/tier1-trigger.ts`**

```typescript
/**
 * Compute the set of Tier 1 prompts that should fire based on detected
 * features in the mkdocs config and the explain pre-pass.
 *
 * Pure: input is a ConversionPlan, output is an ordered list of trigger tags.
 * The orchestrator iterates this list and dispatches to the corresponding
 * prompt builder.
 */

import type { ConversionPlan } from '../../domain/wizard/plan.js';

export type Tier1Trigger =
  | 'tabs'
  | 'sidebar-topics'
  | 'snippets'
  | 'rss'
  | 'i18n'
  | 'mike'
  | 'palette'
  | 'extra-assets';

const ORDER: ReadonlyArray<Tier1Trigger> = [
  'tabs',
  'sidebar-topics',
  'snippets',
  'rss',
  'i18n',
  'mike',
  'palette',
  'extra-assets',
];

export function triggerSet(plan: ConversionPlan): ReadonlyArray<Tier1Trigger> {
  const themeFeatures = collectThemeFeatures(plan);
  const pluginNames = new Set(plan.config.plugins.map((p) => p.name));
  const extensionNames = new Set(
    plan.config.markdownExtensions.map((e) => e.name),
  );

  const fired = new Set<Tier1Trigger>();
  if (themeFeatures.includes('content.tabs.link')) fired.add('tabs');
  if (themeFeatures.includes('navigation.tabs')) fired.add('sidebar-topics');
  if (extensionNames.has('pymdownx.snippets')) fired.add('snippets');
  if (pluginNames.has('rss')) fired.add('rss');
  if (pluginNames.has('i18n')) fired.add('i18n');
  if (pluginNames.has('mike')) fired.add('mike');
  if (
    plan.config.theme?.options &&
    'palette' in plan.config.theme.options &&
    plan.config.theme.options.palette !== undefined &&
    plan.config.theme.options.palette !== null
  ) {
    fired.add('palette');
  }
  if (plan.detectedExtraCss.length > 0 || plan.detectedExtraJs.length > 0) {
    fired.add('extra-assets');
  }

  return ORDER.filter((t) => fired.has(t));
}

function collectThemeFeatures(plan: ConversionPlan): ReadonlyArray<string> {
  const f = plan.config.theme?.options.features;
  return Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : [];
}
```

- [ ] **Step 4.4: Run the tests**

Run: `npx vitest run src/use-cases/wizard/tier1-trigger.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 4.5: Commit**

```bash
git add src/use-cases/wizard/tier1-trigger.ts src/use-cases/wizard/tier1-trigger.test.ts
git commit -m "feat(wizard): compute Tier 1 trigger set from ConversionPlan"
```

---

## Task 5: `answers-to-flags.ts` — round-trip wizard answers ↔ argv

**Files:**
- Create: `src/use-cases/wizard/answers-to-flags.ts`
- Create: `src/use-cases/wizard/answers-to-flags.test.ts`

- [ ] **Step 5.1: Write the failing test (round-trip property)**

Create `src/use-cases/wizard/answers-to-flags.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { answersToFlags } from './answers-to-flags.js';
import type { WizardAnswers } from '../../domain/wizard/answers.js';

const baseline: WizardAnswers = {
  projectDir: './project',
  outputDir: './output',
  packageManager: 'npm',
  check: true,
  tabs: 'mdx',
  sidebarTopics: true,
  rss: true,
  mikeVersions: [],
  palette: 'translate',
  extraAssets: [],
  locales: [],
  snippetBasePaths: [],
  snippetMaxDepth: 8,
  snippetDedentSubsections: false,
  linksValidator: true,
  expressiveCodeTheme: null,
  cards: 'html',
  mdxMode: 'auto',
  logoReplacesTitle: false,
  admonitionMapPath: null,
  keepExplicitHeadingIds: false,
  smartSymbols: true,
  emojiShortcodes: true,
  inlineMarks: true,
  autoAppend: true,
  suppressRules: [],
  configFormat: 'mjs',
  packageName: null,
};

describe('answersToFlags', () => {
  it('emits only positionals when every answer matches the converter default', () => {
    expect(answersToFlags(baseline)).toEqual(['./project', './output']);
  });

  it('emits --no-check when check is disabled', () => {
    expect(answersToFlags({ ...baseline, check: false })).toContain('--no-check');
  });

  it('emits --tabs html only when non-default', () => {
    expect(answersToFlags({ ...baseline, tabs: 'html' })).toContain('--tabs=html');
  });

  it('emits --no-links-validator when disabled', () => {
    expect(answersToFlags({ ...baseline, linksValidator: false })).toContain(
      '--no-links-validator',
    );
  });

  it('repeats --snippet-base-path for each entry', () => {
    const flags = answersToFlags({
      ...baseline,
      snippetBasePaths: ['docs', 'overrides'],
    });
    expect(flags.filter((f) => f === '--snippet-base-path').length).toBe(2);
    expect(flags).toContain('docs');
    expect(flags).toContain('overrides');
  });

  it('emits --suppress for each suppressed rule', () => {
    const flags = answersToFlags({
      ...baseline,
      suppressRules: ['palette-translated', 'mdx-promotion'],
    });
    expect(flags).toContain('--suppress=palette-translated');
    expect(flags).toContain('--suppress=mdx-promotion');
  });

  it('emits --package-manager pnpm when non-default', () => {
    expect(answersToFlags({ ...baseline, packageManager: 'pnpm' })).toContain(
      '--package-manager=pnpm',
    );
  });
});
```

- [ ] **Step 5.2: Run the test to confirm it fails**

Run: `npx vitest run src/use-cases/wizard/answers-to-flags.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5.3: Create `src/use-cases/wizard/answers-to-flags.ts`**

```typescript
/**
 * Convert WizardAnswers back to the equivalent CLI argv.
 *
 * Used in two places:
 *   1. The `--dry-run` plan output prints the equivalent command so the user
 *      can re-run unattended.
 *   2. Round-trip tests verify that parseArgs(answersToFlags(a)) → a.
 *
 * Only emits flags for non-default values to keep the output minimal.
 */

import type { WizardAnswers } from '../../domain/wizard/answers.js';

const DEFAULTS: Omit<WizardAnswers, 'projectDir' | 'outputDir'> = {
  packageManager: 'npm',
  check: true,
  tabs: 'mdx',
  sidebarTopics: true,
  rss: true,
  mikeVersions: [],
  palette: 'translate',
  extraAssets: [],
  locales: [],
  snippetBasePaths: [],
  snippetMaxDepth: 8,
  snippetDedentSubsections: false,
  linksValidator: true,
  expressiveCodeTheme: null,
  cards: 'html',
  mdxMode: 'auto',
  logoReplacesTitle: false,
  admonitionMapPath: null,
  keepExplicitHeadingIds: false,
  smartSymbols: true,
  emojiShortcodes: true,
  inlineMarks: true,
  autoAppend: true,
  suppressRules: [],
  configFormat: 'mjs',
  packageName: null,
};

export function answersToFlags(a: WizardAnswers): ReadonlyArray<string> {
  const out: string[] = [a.projectDir, a.outputDir];

  if (a.packageManager !== DEFAULTS.packageManager)
    out.push(`--package-manager=${a.packageManager}`);
  if (a.check !== DEFAULTS.check) out.push(a.check ? '--check' : '--no-check');
  if (a.tabs !== DEFAULTS.tabs) out.push(`--tabs=${a.tabs}`);
  if (a.sidebarTopics !== DEFAULTS.sidebarTopics)
    out.push(a.sidebarTopics ? '--sidebar-topics' : '--no-sidebar-topics');
  if (a.rss !== DEFAULTS.rss) out.push(a.rss ? '--rss' : '--no-rss');
  for (const v of a.mikeVersions) out.push(`--mike-versions=${v}`);
  if (a.palette !== DEFAULTS.palette) out.push(`--palette=${a.palette}`);
  for (const p of a.extraAssets) out.push(`--extra-asset=${p}`);
  for (const l of a.locales) out.push(`--locale=${l}`);
  for (const p of a.snippetBasePaths) {
    out.push('--snippet-base-path', p);
  }
  if (a.snippetMaxDepth !== DEFAULTS.snippetMaxDepth)
    out.push(`--snippet-max-depth=${String(a.snippetMaxDepth)}`);
  if (a.snippetDedentSubsections !== DEFAULTS.snippetDedentSubsections)
    out.push('--snippet-dedent-subsections');
  if (a.linksValidator !== DEFAULTS.linksValidator)
    out.push(a.linksValidator ? '--links-validator' : '--no-links-validator');
  if (a.expressiveCodeTheme !== null)
    out.push(`--expressive-code-theme=${a.expressiveCodeTheme}`);
  if (a.cards !== DEFAULTS.cards) out.push(`--cards=${a.cards}`);
  if (a.mdxMode !== DEFAULTS.mdxMode) out.push(`--mdx-mode=${a.mdxMode}`);
  if (a.logoReplacesTitle) out.push('--logo-replaces-title');
  if (a.admonitionMapPath !== null)
    out.push(`--admonition-map=${a.admonitionMapPath}`);
  if (a.keepExplicitHeadingIds) out.push('--keep-explicit-heading-ids');
  if (a.smartSymbols !== DEFAULTS.smartSymbols && !a.smartSymbols)
    out.push('--no-smart-symbols');
  if (a.emojiShortcodes !== DEFAULTS.emojiShortcodes && !a.emojiShortcodes)
    out.push('--no-emoji-shortcodes');
  if (a.inlineMarks !== DEFAULTS.inlineMarks && !a.inlineMarks)
    out.push('--no-inline-marks');
  if (a.autoAppend !== DEFAULTS.autoAppend && !a.autoAppend)
    out.push('--no-auto-append');
  for (const r of a.suppressRules) out.push(`--suppress=${r}`);
  if (a.configFormat !== DEFAULTS.configFormat)
    out.push(`--config-format=${a.configFormat}`);
  if (a.packageName !== null) out.push(`--package-name=${a.packageName}`);

  return out;
}
```

- [ ] **Step 5.4: Run the tests**

Run: `npx vitest run src/use-cases/wizard/answers-to-flags.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5.5: Commit**

```bash
git add src/use-cases/wizard/answers-to-flags.ts src/use-cases/wizard/answers-to-flags.test.ts
git commit -m "feat(wizard): convert WizardAnswers back to equivalent CLI flags"
```

---

## Task 6: `run-wizard.ts` orchestrator (driven by Prompter)

**Files:**
- Create: `src/use-cases/wizard/run-wizard.ts`
- Create: `src/use-cases/wizard/run-wizard.test.ts`
- Create: `src/use-cases/wizard/fake-prompter.ts` (test helper, exported for integration tests too)

- [ ] **Step 6.1: Create `src/use-cases/wizard/fake-prompter.ts`**

```typescript
/**
 * Test fake for the Prompter port. Scripted answers in, recorded calls out.
 * Returning `null` from any answer simulates Ctrl+C cancellation.
 */

import type {
  ConfirmOptions,
  MultiselectOptions,
  Prompter,
  SelectOptions,
  TextOptions,
} from '../../domain/wizard/ports/prompter.js';

export interface ScriptedAnswers {
  text?: ReadonlyArray<string | null>;
  confirm?: ReadonlyArray<boolean | null>;
  select?: ReadonlyArray<string | null>;
  multiselect?: ReadonlyArray<ReadonlyArray<string> | null>;
}

export interface FakePrompter extends Prompter {
  readonly calls: ReadonlyArray<{ kind: string; message: string }>;
}

export function createFakePrompter(script: ScriptedAnswers = {}): FakePrompter {
  const calls: Array<{ kind: string; message: string }> = [];
  const cursors = { text: 0, confirm: 0, select: 0, multiselect: 0 };

  function next<T>(
    kind: 'text' | 'confirm' | 'select' | 'multiselect',
    fallback: T,
  ): T {
    const list = script[kind] as ReadonlyArray<unknown> | undefined;
    if (list === undefined) return fallback;
    const value = list[cursors[kind]++];
    return value === undefined ? fallback : (value as T);
  }

  return {
    intro: () => {},
    outro: () => {},
    note: () => {},
    text: async (o: TextOptions) => {
      calls.push({ kind: 'text', message: o.message });
      return next<string | null>('text', o.initialValue ?? '');
    },
    confirm: async (o: ConfirmOptions) => {
      calls.push({ kind: 'confirm', message: o.message });
      return next<boolean | null>('confirm', o.initialValue ?? true);
    },
    select: async <V extends string>(o: SelectOptions<V>) => {
      calls.push({ kind: 'select', message: o.message });
      return next<V | null>('select', o.initialValue ?? o.options[0]!.value);
    },
    multiselect: async <V extends string>(o: MultiselectOptions<V>) => {
      calls.push({ kind: 'multiselect', message: o.message });
      return next<ReadonlyArray<V> | null>(
        'multiselect',
        (o.initialValues ?? []) as ReadonlyArray<V>,
      );
    },
    get calls() {
      return calls;
    },
  };
}
```

- [ ] **Step 6.2: Write the failing tests**

Create `src/use-cases/wizard/run-wizard.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runWizard } from './run-wizard.js';
import { createFakePrompter } from './fake-prompter.js';
import { deriveDefaults } from './derive-defaults.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import { WIZARD_CANCELLED } from '../../domain/wizard/answers.js';

function makePlan(over: Partial<MkdocsConfig> = {}): ConversionPlan {
  const config: MkdocsConfig = {
    siteName: 'My Docs',
    siteDescription: null,
    siteUrl: null,
    docsDir: 'docs',
    repoUrl: null,
    editUri: null,
    nav: [],
    theme: null,
    plugins: [],
    markdownExtensions: [],
    extras: { record: {}, hooks: null },
    ...over,
  };
  return {
    config,
    mappingRows: [],
    detectedExtraCss: [],
    detectedExtraJs: [],
    detectedLocales: [],
    snippetCandidateDirs: [],
  };
}

describe('runWizard — Tier 0 only (vanilla site)', () => {
  it('returns answers when the user accepts every default', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      text: ['/o'], // outputDir only — projectDir is an input, not a prompt
      // Tier 0 confirms: check (true), proceed (true)
      confirm: [true, true],
      select: ['npm', 'apply'], // package manager + final action
    });

    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.projectDir).toBe('/p');
      expect(result.value.outputDir).toBe('/o');
      expect(result.value.check).toBe(true);
      expect(result.value.packageManager).toBe('npm');
    }
  });

  it('returns WIZARD_CANCELLED when user cancels at outputDir prompt', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({ text: [null] });
    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(WIZARD_CANCELLED);
  });
});

describe('runWizard — Tier 1 conditional (content.tabs.link → tabs prompt)', () => {
  it('asks the tabs question when content.tabs.link is detected', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['content.tabs.link'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      text: ['/o'],
      confirm: [true, true],
      select: ['npm', 'mdx', 'apply'],
    });
    const result = await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tabs).toBe('mdx');
    expect(prompter.calls.some((c) => c.message.toLowerCase().includes('tab'))).toBe(true);
  });

  it('does NOT ask the tabs question on a vanilla site', async () => {
    const plan = makePlan();
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      text: ['/o'],
      confirm: [true, true],
      select: ['npm', 'apply'],
    });
    await runWizard({
      projectDir: '/p',
      plan,
      defaults,
      prompter,
    });
    expect(prompter.calls.some((c) => c.message.toLowerCase().includes('tab'))).toBe(false);
  });
});
```

- [ ] **Step 6.3: Run the tests to confirm they fail**

Run: `npx vitest run src/use-cases/wizard/run-wizard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.4: Create `src/use-cases/wizard/run-wizard.ts`**

```typescript
/**
 * The wizard orchestrator. Pure: takes a Prompter port and a ConversionPlan,
 * returns a Result wrapping WizardAnswers or WIZARD_CANCELLED.
 *
 * Flow:
 *   Tier 0 (always): projectDir, outputDir, packageManager, check, final-confirm
 *   Tier 1 (conditional, driven by tier1Trigger): tabs, sidebar-topics, ...
 *   Tier 2 (advanced, gated by a final select): one groupMultiselect of toggles
 *
 * Cancellation: any prompt returning null short-circuits to err(WIZARD_CANCELLED).
 */

import type { Prompter } from '../../domain/wizard/ports/prompter.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import {
  type DefaultAnswers,
  type PackageManager,
  type WizardAnswers,
  type WizardCancelled,
  WIZARD_CANCELLED,
} from '../../domain/wizard/answers.js';
import { type Result, err, ok } from '../../domain/result.js';
import { triggerSet } from './tier1-trigger.js';
import { deriveOutputDirName } from './derive-defaults.js';

export interface RunWizardInput {
  /** Project directory chosen *before* entering the wizard (so the caller can
   *  read mkdocs.yml and build the ConversionPlan). The wizard treats this as
   *  fixed input and does not re-prompt for it. */
  readonly projectDir: string;
  readonly plan: ConversionPlan;
  readonly defaults: DefaultAnswers;
  readonly prompter: Prompter;
}

export async function runWizard(
  input: RunWizardInput,
): Promise<Result<WizardAnswers, WizardCancelled>> {
  const { projectDir, plan, defaults, prompter } = input;

  prompter.intro('mkdocs-material-to-starlight');

  const outputDir = await prompter.text({
    message: 'Output directory',
    initialValue: deriveOutputDirName(plan.config.siteName),
  });
  if (outputDir === null) return err(WIZARD_CANCELLED);

  const packageManager = await prompter.select<PackageManager>({
    message: 'Package manager (used in the final "next steps" hint)',
    options: [
      { value: 'npm', label: 'npm' },
      { value: 'pnpm', label: 'pnpm' },
      { value: 'yarn', label: 'yarn' },
      { value: 'bun', label: 'bun' },
    ],
    initialValue: defaults.packageManager,
  });
  if (packageManager === null) return err(WIZARD_CANCELLED);

  const check = await prompter.confirm({
    message: 'Run `astro check` against the converted site?',
    initialValue: defaults.check,
  });
  if (check === null) return err(WIZARD_CANCELLED);

  const triggers = triggerSet(plan);
  const conditional: Partial<WizardAnswers> = {};

  if (triggers.includes('tabs')) {
    const tabs = await prompter.select<'mdx' | 'html'>({
      message:
        'Tabs strategy — `content.tabs.link` is enabled in your mkdocs.yml',
      options: [
        { value: 'mdx', label: 'MDX <Tabs syncKey> (recommended; cross-page sync)' },
        { value: 'html', label: 'Plain HTML (no sync, no MDX requirement)' },
      ],
      initialValue: defaults.tabs,
    });
    if (tabs === null) return err(WIZARD_CANCELLED);
    conditional.tabs = tabs;
  }

  // Final confirm
  const action = await prompter.select<'apply' | 'cancel'>({
    message: 'Convert now?',
    options: [
      { value: 'apply', label: 'Convert' },
      { value: 'cancel', label: 'Cancel' },
    ],
    initialValue: 'apply',
  });
  if (action === null || action === 'cancel') return err(WIZARD_CANCELLED);

  return ok({
    projectDir,
    outputDir,
    packageManager,
    check,
    tabs: conditional.tabs ?? defaults.tabs,
    sidebarTopics: defaults.sidebarTopics,
    rss: defaults.rss,
    mikeVersions: defaults.mikeVersions,
    palette: defaults.palette,
    extraAssets: defaults.extraAssets,
    locales: defaults.locales,
    snippetBasePaths: defaults.snippetBasePaths,
    snippetMaxDepth: defaults.snippetMaxDepth,
    snippetDedentSubsections: defaults.snippetDedentSubsections,
    linksValidator: defaults.linksValidator,
    expressiveCodeTheme: defaults.expressiveCodeTheme,
    cards: defaults.cards,
    mdxMode: defaults.mdxMode,
    logoReplacesTitle: defaults.logoReplacesTitle,
    admonitionMapPath: defaults.admonitionMapPath,
    keepExplicitHeadingIds: defaults.keepExplicitHeadingIds,
    smartSymbols: defaults.smartSymbols,
    emojiShortcodes: defaults.emojiShortcodes,
    inlineMarks: defaults.inlineMarks,
    autoAppend: defaults.autoAppend,
    suppressRules: defaults.suppressRules,
    configFormat: defaults.configFormat,
    packageName: defaults.packageName,
  });
}
```

> **Note on scope:** the orchestrator above implements Tier 0 + the `tabs` Tier 1 prompt + final confirm. The remaining 7 Tier 1 prompts (sidebar-topics, snippets, rss, i18n, mike, palette, extra-assets) and the Tier 2 advanced groupMultiselect are added in **Task 6b**. Splitting keeps each commit small and reviewable.

- [ ] **Step 6.5: Run the tests**

Run: `npx vitest run src/use-cases/wizard/run-wizard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6.6: Commit**

```bash
git add src/use-cases/wizard/run-wizard.ts src/use-cases/wizard/run-wizard.test.ts src/use-cases/wizard/fake-prompter.ts
git commit -m "feat(wizard): orchestrator with Tier 0 + tabs Tier 1 + cancellation"
```

---

## Task 6b: Extend `run-wizard.ts` with remaining Tier 1 + Tier 2 prompts

**Files:**
- Modify: `src/use-cases/wizard/run-wizard.ts`
- Modify: `src/use-cases/wizard/run-wizard.test.ts`

- [ ] **Step 6b.1: Add failing tests for remaining triggers**

Append to `src/use-cases/wizard/run-wizard.test.ts`:

```typescript
describe('runWizard — additional Tier 1 prompts', () => {
  it('asks sidebar-topics when navigation.tabs is detected', async () => {
    const plan = makePlan({
      theme: { name: 'material', options: { features: ['navigation.tabs'] } },
    });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      text: ['/p', '/o'],
      confirm: [true, true, true], // check, sidebar-topics, proceed
      select: ['npm', 'apply'],
    });
    const result = await runWizard({ plan, defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.sidebarTopics).toBe(true);
    expect(
      prompter.calls.some((c) => c.message.toLowerCase().includes('topics')),
    ).toBe(true);
  });

  it('asks rss confirmation when rss plugin is present', async () => {
    const plan = makePlan({ plugins: [{ name: 'rss', options: {} }] });
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      text: ['/p', '/o'],
      confirm: [true, true, true], // check, rss, proceed
      select: ['npm', 'apply'],
    });
    const result = await runWizard({ plan, defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.rss).toBe(true);
  });

  it('asks i18n locale multiselect when i18n plugin is present', async () => {
    const plan = makePlan({ plugins: [{ name: 'i18n', options: {} }] });
    const planWithLocales: ConversionPlan = {
      ...plan,
      detectedLocales: ['en', 'fr', 'de'],
    };
    const defaults = deriveDefaults(plan.config, { userAgent: undefined, env: {} });
    const prompter = createFakePrompter({
      text: ['/p', '/o'],
      confirm: [true, true],
      select: ['npm', 'apply'],
      multiselect: [['en', 'fr']],
    });
    const result = await runWizard({ plan: planWithLocales, defaults, prompter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.locales).toEqual(['en', 'fr']);
  });
});
```

- [ ] **Step 6b.2: Run to confirm they fail**

Run: `npx vitest run src/use-cases/wizard/run-wizard.test.ts -t 'additional Tier 1'`
Expected: FAIL — orchestrator doesn't ask these yet.

- [ ] **Step 6b.3: Extend `run-wizard.ts`**

Replace the body of `runWizard` after the `check` prompt and before the final confirm with:

```typescript
  const triggers = triggerSet(plan);
  const conditional: Partial<WizardAnswers> = {};

  if (triggers.includes('tabs')) {
    const tabs = await prompter.select<'mdx' | 'html'>({
      message:
        'Tabs strategy — `content.tabs.link` is enabled in your mkdocs.yml',
      options: [
        { value: 'mdx', label: 'MDX <Tabs syncKey> (recommended; cross-page sync)' },
        { value: 'html', label: 'Plain HTML (no sync, no MDX requirement)' },
      ],
      initialValue: defaults.tabs,
    });
    if (tabs === null) return err(WIZARD_CANCELLED);
    conditional.tabs = tabs;
  }

  if (triggers.includes('sidebar-topics')) {
    const v = await prompter.confirm({
      message:
        'Install `starlight-sidebar-topics` and split sidebar by top-level group? (`navigation.tabs` is enabled)',
      initialValue: defaults.sidebarTopics,
    });
    if (v === null) return err(WIZARD_CANCELLED);
    conditional.sidebarTopics = v;
  }

  if (triggers.includes('snippets')) {
    if (plan.snippetCandidateDirs.length > 0) {
      const v = await prompter.multiselect({
        message: 'Snippet base paths (resolves PyMdown snippet includes)',
        options: plan.snippetCandidateDirs.map((d) => ({ value: d, label: d })),
        initialValues: plan.snippetCandidateDirs,
      });
      if (v === null) return err(WIZARD_CANCELLED);
      conditional.snippetBasePaths = v;
    }
  }

  if (triggers.includes('rss')) {
    const v = await prompter.confirm({
      message: 'Generate `src/pages/rss.xml.ts` endpoint? (rss plugin detected)',
      initialValue: defaults.rss,
    });
    if (v === null) return err(WIZARD_CANCELLED);
    conditional.rss = v;
  }

  if (triggers.includes('i18n')) {
    if (plan.detectedLocales.length > 0) {
      const v = await prompter.multiselect({
        message: 'Locales to carry over',
        options: plan.detectedLocales.map((l) => ({ value: l, label: l })),
        initialValues: plan.detectedLocales,
      });
      if (v === null) return err(WIZARD_CANCELLED);
      conditional.locales = v;
    }
  }

  if (triggers.includes('mike')) {
    const v = await prompter.text({
      message: 'Mike versions (comma-separated slugs, e.g. `v1,v2,latest`)',
      initialValue: defaults.mikeVersions.join(','),
    });
    if (v === null) return err(WIZARD_CANCELLED);
    conditional.mikeVersions = v
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  if (triggers.includes('palette')) {
    const v = await prompter.select<'translate' | 'skip' | 'custom'>({
      message: 'Material palette translation',
      options: [
        { value: 'translate', label: 'Translate to Starlight accent (recommended)' },
        { value: 'skip', label: 'Skip — use Starlight default accent' },
        { value: 'custom', label: 'Skip — I will write the accent vars myself' },
      ],
      initialValue: defaults.palette,
    });
    if (v === null) return err(WIZARD_CANCELLED);
    conditional.palette = v;
  }

  if (triggers.includes('extra-assets')) {
    const all = [...plan.detectedExtraCss, ...plan.detectedExtraJs];
    if (all.length > 0) {
      const v = await prompter.multiselect({
        message: 'Carry over which `extra_css` / `extra_javascript` entries?',
        options: all.map((p) => ({ value: p, label: p })),
        initialValues: all,
      });
      if (v === null) return err(WIZARD_CANCELLED);
      conditional.extraAssets = v;
    }
  }

  // Tier 2 — advanced opt-in
  const advanced = await prompter.select<'apply' | 'advanced' | 'cancel'>({
    message: 'Ready?',
    options: [
      { value: 'apply', label: 'Convert now' },
      { value: 'advanced', label: 'Show advanced options first' },
      { value: 'cancel', label: 'Cancel' },
    ],
    initialValue: 'apply',
  });
  if (advanced === null || advanced === 'cancel') return err(WIZARD_CANCELLED);

  let advancedAnswers: Partial<WizardAnswers> = {};
  if (advanced === 'advanced') {
    const advResult = await runAdvancedTier({ defaults, prompter });
    if (!advResult.ok) return advResult;
    advancedAnswers = advResult.value;
    const finalAction = await prompter.select<'apply' | 'cancel'>({
      message: 'Convert now?',
      options: [
        { value: 'apply', label: 'Convert' },
        { value: 'cancel', label: 'Cancel' },
      ],
      initialValue: 'apply',
    });
    if (finalAction === null || finalAction === 'cancel')
      return err(WIZARD_CANCELLED);
  }
```

And replace the final `return ok({…})` to merge `advancedAnswers` after `conditional`:

```typescript
  return ok({
    projectDir,
    outputDir,
    packageManager,
    check,
    tabs: conditional.tabs ?? defaults.tabs,
    sidebarTopics: conditional.sidebarTopics ?? defaults.sidebarTopics,
    rss: conditional.rss ?? defaults.rss,
    mikeVersions: conditional.mikeVersions ?? defaults.mikeVersions,
    palette: conditional.palette ?? defaults.palette,
    extraAssets: conditional.extraAssets ?? defaults.extraAssets,
    locales: conditional.locales ?? defaults.locales,
    snippetBasePaths: conditional.snippetBasePaths ?? defaults.snippetBasePaths,
    snippetMaxDepth: advancedAnswers.snippetMaxDepth ?? defaults.snippetMaxDepth,
    snippetDedentSubsections:
      advancedAnswers.snippetDedentSubsections ?? defaults.snippetDedentSubsections,
    linksValidator: advancedAnswers.linksValidator ?? defaults.linksValidator,
    expressiveCodeTheme:
      advancedAnswers.expressiveCodeTheme ?? defaults.expressiveCodeTheme,
    cards: advancedAnswers.cards ?? defaults.cards,
    mdxMode: advancedAnswers.mdxMode ?? defaults.mdxMode,
    logoReplacesTitle: advancedAnswers.logoReplacesTitle ?? defaults.logoReplacesTitle,
    admonitionMapPath: advancedAnswers.admonitionMapPath ?? defaults.admonitionMapPath,
    keepExplicitHeadingIds:
      advancedAnswers.keepExplicitHeadingIds ?? defaults.keepExplicitHeadingIds,
    smartSymbols: advancedAnswers.smartSymbols ?? defaults.smartSymbols,
    emojiShortcodes: advancedAnswers.emojiShortcodes ?? defaults.emojiShortcodes,
    inlineMarks: advancedAnswers.inlineMarks ?? defaults.inlineMarks,
    autoAppend: advancedAnswers.autoAppend ?? defaults.autoAppend,
    suppressRules: advancedAnswers.suppressRules ?? defaults.suppressRules,
    configFormat: advancedAnswers.configFormat ?? defaults.configFormat,
    packageName: advancedAnswers.packageName ?? defaults.packageName,
  });
}

async function runAdvancedTier(input: {
  readonly defaults: DefaultAnswers;
  readonly prompter: Prompter;
}): Promise<Result<Partial<WizardAnswers>, WizardCancelled>> {
  const { defaults, prompter } = input;
  const linksValidator = await prompter.confirm({
    message: 'Run `starlight-links-validator` on every build? (slow on first run)',
    initialValue: defaults.linksValidator,
  });
  if (linksValidator === null) return err(WIZARD_CANCELLED);

  const cards = await prompter.select<'mdx' | 'html' | 'skip'>({
    message: 'Card / grid output',
    options: [
      { value: 'html', label: 'HTML + shipped CSS shim (default)' },
      { value: 'mdx', label: 'Starlight <Card> / <CardGrid> MDX' },
      { value: 'skip', label: 'Skip — no cards, no shim' },
    ],
    initialValue: defaults.cards,
  });
  if (cards === null) return err(WIZARD_CANCELLED);

  const mdxMode = await prompter.select<'auto' | 'always' | 'never'>({
    message: '.mdx promotion strategy',
    options: [
      { value: 'auto', label: 'Auto — promote when JSX/imports detected (default)' },
      { value: 'always', label: 'Always — every page becomes .mdx' },
      { value: 'never', label: 'Never — keep .md (may break embedded JSX)' },
    ],
    initialValue: defaults.mdxMode,
  });
  if (mdxMode === null) return err(WIZARD_CANCELLED);

  const configFormat = await prompter.select<'mjs' | 'ts'>({
    message: 'Astro config format',
    options: [
      { value: 'mjs', label: 'astro.config.mjs (default)' },
      { value: 'ts', label: 'astro.config.ts (typed)' },
    ],
    initialValue: defaults.configFormat,
  });
  if (configFormat === null) return err(WIZARD_CANCELLED);

  return ok({ linksValidator, cards, mdxMode, configFormat });
}
```

- [ ] **Step 6b.4: Run the tests**

Run: `npx vitest run src/use-cases/wizard/run-wizard.test.ts`
Expected: all tests pass (original Tier 0 + Tier 1 additions).

- [ ] **Step 6b.5: Commit**

```bash
git add src/use-cases/wizard/run-wizard.ts src/use-cases/wizard/run-wizard.test.ts
git commit -m "feat(wizard): full Tier 1 + Tier 2 advanced prompts"
```

---

## Task 7: Extend `parse-args.ts` with all new wizard flags

**Files:**
- Modify: `src/interface/cli/parse-args.ts`
- Modify: `src/interface/cli/parse-args.test.ts`

- [ ] **Step 7.1: Write failing tests for new flags**

Append to `src/interface/cli/parse-args.test.ts`:

```typescript
describe('parseArgs — wizard flag surface', () => {
  it('parses --no-check (negation)', () => {
    const r = parseArgs(['./p', './o', '--no-check']);
    expect(r.kind).toBe('convert');
    if (r.kind === 'convert') expect(r.check).toBe(false);
  });

  it('parses --tabs=mdx and --tabs=html', () => {
    expect((parseArgs(['./p', './o', '--tabs=mdx']) as any).tabs).toBe('mdx');
    expect((parseArgs(['./p', './o', '--tabs=html']) as any).tabs).toBe('html');
  });

  it('rejects invalid --tabs value', () => {
    const r = parseArgs(['./p', './o', '--tabs=bogus']);
    expect(r.kind).toBe('error');
  });

  it('parses repeated --suppress', () => {
    const r = parseArgs(['./p', './o', '--suppress=a', '--suppress=b']);
    expect(r.kind).toBe('convert');
    if (r.kind === 'convert') expect(r.suppressRules).toEqual(['a', 'b']);
  });

  it('parses --yes and --force as short aliases too', () => {
    const r = parseArgs(['./p', './o', '-y', '-f']);
    expect(r.kind).toBe('convert');
    if (r.kind === 'convert') {
      expect(r.yes).toBe(true);
      expect(r.force).toBe(true);
    }
  });

  it('parses --json + --quiet', () => {
    const r = parseArgs(['./p', './o', '--json', '-q']);
    expect(r.kind).toBe('convert');
    if (r.kind === 'convert') {
      expect(r.json).toBe(true);
      expect(r.quiet).toBe(true);
    }
  });

  it('parses --no-color and --color', () => {
    const a = parseArgs(['./p', './o', '--no-color']);
    expect(a.kind).toBe('convert');
    if (a.kind === 'convert') expect(a.color).toBe(false);
    const b = parseArgs(['./p', './o', '--color']);
    if (b.kind === 'convert') expect(b.color).toBe(true);
  });

  it('parses --package-manager pnpm', () => {
    const r = parseArgs(['./p', './o', '--package-manager=pnpm']);
    expect(r.kind).toBe('convert');
    if (r.kind === 'convert') expect(r.packageManager).toBe('pnpm');
  });
});
```

- [ ] **Step 7.2: Run them to confirm failure**

Run: `npx vitest run src/interface/cli/parse-args.test.ts -t 'wizard flag surface'`
Expected: FAIL.

- [ ] **Step 7.3: Extend `parse-args.ts`**

Replace `CONVERT_OPTIONS` with the full set, extend the `convert` Command shape, and add per-flag validation. Apply this single replacement:

In `src/interface/cli/parse-args.ts`, replace the `CONVERT_OPTIONS` constant and the `convert` member of `Command` with:

```typescript
const CONVERT_OPTIONS = {
  // help / version
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean' },
  // existing
  'snippet-base-path': { type: 'string', multiple: true },
  'dry-run': { type: 'boolean' },
  explain: { type: 'boolean' },
  check: { type: 'boolean' },
  'no-check': { type: 'boolean' },
  'check-timeout': { type: 'string' },
  // global wizard surface
  yes: { type: 'boolean', short: 'y' },
  'no-interactive': { type: 'boolean' },
  ci: { type: 'boolean' },
  force: { type: 'boolean', short: 'f' },
  quiet: { type: 'boolean', short: 'q' },
  json: { type: 'boolean' },
  color: { type: 'boolean' },
  'no-color': { type: 'boolean' },
  dir: { type: 'string', short: 'C' },
  'package-manager': { type: 'string' },
  // Tier 1
  tabs: { type: 'string' },
  'sidebar-topics': { type: 'boolean' },
  'no-sidebar-topics': { type: 'boolean' },
  rss: { type: 'boolean' },
  'no-rss': { type: 'boolean' },
  'mike-versions': { type: 'string', multiple: true },
  palette: { type: 'string' },
  'extra-asset': { type: 'string', multiple: true },
  locale: { type: 'string', multiple: true },
  'snippet-max-depth': { type: 'string' },
  'snippet-dedent-subsections': { type: 'boolean' },
  // Tier 2
  'links-validator': { type: 'boolean' },
  'no-links-validator': { type: 'boolean' },
  'expressive-code-theme': { type: 'string' },
  cards: { type: 'string' },
  'mdx-mode': { type: 'string' },
  'logo-replaces-title': { type: 'boolean' },
  'admonition-map': { type: 'string' },
  'keep-explicit-heading-ids': { type: 'boolean' },
  'no-smart-symbols': { type: 'boolean' },
  'no-emoji-shortcodes': { type: 'boolean' },
  'no-inline-marks': { type: 'boolean' },
  'no-auto-append': { type: 'boolean' },
  suppress: { type: 'string', multiple: true },
  'config-format': { type: 'string' },
  'package-name': { type: 'string' },
} as const;
```

Update the `convert` variant in `Command`:

```typescript
  | {
      readonly kind: 'convert';
      readonly projectDir: string;
      readonly outputDir: string;
      readonly snippetBasePaths: ReadonlyArray<string> | null;
      readonly dryRun: boolean;
      readonly check: boolean;
      readonly checkTimeoutMs: number | null;
      // wizard surface
      readonly yes: boolean;
      readonly noInteractive: boolean;
      readonly ci: boolean;
      readonly force: boolean;
      readonly quiet: boolean;
      readonly json: boolean;
      readonly color: boolean | null;
      readonly packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
      readonly tabs: 'mdx' | 'html' | null;
      readonly sidebarTopics: boolean | null;
      readonly rss: boolean | null;
      readonly mikeVersions: ReadonlyArray<string>;
      readonly palette: 'translate' | 'skip' | 'custom' | null;
      readonly extraAssets: ReadonlyArray<string>;
      readonly locales: ReadonlyArray<string>;
      readonly snippetMaxDepth: number | null;
      readonly snippetDedentSubsections: boolean;
      readonly linksValidator: boolean | null;
      readonly expressiveCodeTheme: string | null;
      readonly cards: 'mdx' | 'html' | 'skip' | null;
      readonly mdxMode: 'auto' | 'always' | 'never' | null;
      readonly logoReplacesTitle: boolean;
      readonly admonitionMapPath: string | null;
      readonly keepExplicitHeadingIds: boolean;
      readonly noSmartSymbols: boolean;
      readonly noEmojiShortcodes: boolean;
      readonly noInlineMarks: boolean;
      readonly noAutoAppend: boolean;
      readonly suppressRules: ReadonlyArray<string>;
      readonly configFormat: 'mjs' | 'ts' | null;
      readonly packageName: string | null;
    }
```

Then extend the body of `parseConvertArgs` after the existing `snippetBasePaths` resolution to read every new flag, validate enums, and populate the convert object. The validation snippet for enums:

```typescript
function parseEnum<T extends string>(
  raw: string | undefined,
  allowed: ReadonlyArray<T>,
  flag: string,
): { ok: true; value: T | null } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: null };
  if ((allowed as ReadonlyArray<string>).includes(raw)) {
    return { ok: true, value: raw as T };
  }
  return {
    ok: false,
    message: `${flag} must be one of ${allowed.join('|')} (got "${raw}")`,
  };
}
```

Use it for `--tabs`, `--palette`, `--cards`, `--mdx-mode`, `--config-format`, `--package-manager`. Resolve booleans-with-negation by computing `flag === true ? true : noFlag === true ? false : null`. Return error if both are set.

Full integration goes into the convert object literal. Set:

```typescript
  return {
    kind: 'convert',
    projectDir: positionals[0] ?? '',
    outputDir: dirOverride ?? positionals[1] ?? '',
    snippetBasePaths,
    dryRun: parsed.values['dry-run'] === true,
    check,
    checkTimeoutMs,
    yes: parsed.values.yes === true,
    noInteractive: parsed.values['no-interactive'] === true,
    ci: parsed.values.ci === true,
    force: parsed.values.force === true,
    quiet: parsed.values.quiet === true,
    json: parsed.values.json === true,
    color:
      parsed.values.color === true ? true :
      parsed.values['no-color'] === true ? false : null,
    packageManager: pmResult.value,
    tabs: tabsResult.value,
    sidebarTopics: resolveBoolPair(
      parsed.values['sidebar-topics'],
      parsed.values['no-sidebar-topics'],
    ),
    rss: resolveBoolPair(parsed.values.rss, parsed.values['no-rss']),
    mikeVersions: (parsed.values['mike-versions'] as string[] | undefined) ?? [],
    palette: paletteResult.value,
    extraAssets: (parsed.values['extra-asset'] as string[] | undefined) ?? [],
    locales: (parsed.values.locale as string[] | undefined) ?? [],
    snippetMaxDepth,
    snippetDedentSubsections: parsed.values['snippet-dedent-subsections'] === true,
    linksValidator: resolveBoolPair(
      parsed.values['links-validator'],
      parsed.values['no-links-validator'],
    ),
    expressiveCodeTheme: parsed.values['expressive-code-theme'] ?? null,
    cards: cardsResult.value,
    mdxMode: mdxModeResult.value,
    logoReplacesTitle: parsed.values['logo-replaces-title'] === true,
    admonitionMapPath: parsed.values['admonition-map'] ?? null,
    keepExplicitHeadingIds: parsed.values['keep-explicit-heading-ids'] === true,
    noSmartSymbols: parsed.values['no-smart-symbols'] === true,
    noEmojiShortcodes: parsed.values['no-emoji-shortcodes'] === true,
    noInlineMarks: parsed.values['no-inline-marks'] === true,
    noAutoAppend: parsed.values['no-auto-append'] === true,
    suppressRules: (parsed.values.suppress as string[] | undefined) ?? [],
    configFormat: configFormatResult.value,
    packageName: parsed.values['package-name'] ?? null,
  };
```

With helper:

```typescript
function resolveBoolPair(
  on: boolean | undefined,
  off: boolean | undefined,
): boolean | null {
  if (on === true) return true;
  if (off === true) return false;
  return null;
}
```

The check / no-check resolution becomes:

```typescript
  if (parsed.values.check === true && parsed.values['no-check'] === true) {
    return { kind: 'error', message: '--check and --no-check are mutually exclusive' };
  }
  const check = parsed.values.check === true
    ? true
    : parsed.values['no-check'] === true
      ? false
      : false;
```

Update existing `convert` literal returns elsewhere in tests that compare full object shape — they will need the new fields filled with `null`/`false`/`[]` defaults.

- [ ] **Step 7.4: Update existing tests that compare full convert objects**

In `src/interface/cli/parse-args.test.ts`, find the test `parses convert with project and output positional args` and update its expected object to include the new defaults:

```typescript
    expect(result).toEqual({
      kind: 'convert',
      projectDir: './project',
      outputDir: './output',
      snippetBasePaths: null,
      dryRun: false,
      check: false,
      checkTimeoutMs: null,
      yes: false,
      noInteractive: false,
      ci: false,
      force: false,
      quiet: false,
      json: false,
      color: null,
      packageManager: null,
      tabs: null,
      sidebarTopics: null,
      rss: null,
      mikeVersions: [],
      palette: null,
      extraAssets: [],
      locales: [],
      snippetMaxDepth: null,
      snippetDedentSubsections: false,
      linksValidator: null,
      expressiveCodeTheme: null,
      cards: null,
      mdxMode: null,
      logoReplacesTitle: false,
      admonitionMapPath: null,
      keepExplicitHeadingIds: false,
      noSmartSymbols: false,
      noEmojiShortcodes: false,
      noInlineMarks: false,
      noAutoAppend: false,
      suppressRules: [],
      configFormat: null,
      packageName: null,
    });
```

- [ ] **Step 7.5: Run all parse-args tests**

Run: `npx vitest run src/interface/cli/parse-args.test.ts`
Expected: all tests pass (original + new wizard surface).

- [ ] **Step 7.6: Run downstream consumer (`main.ts`) tests**

Run: `npx vitest run src/interface/cli/main.test.ts`
Expected: PASS — `main.ts` only reads the existing convert fields it knows about, so the new `null`/default fields are inert.

- [ ] **Step 7.7: Commit**

```bash
git add src/interface/cli/parse-args.ts src/interface/cli/parse-args.test.ts
git commit -m "feat(cli): add wizard-equivalent flag surface (25+ new flags, POSIX-compliant)"
```

---

## Task 8: `infrastructure/env/tty-detection.ts`

**Files:**
- Create: `src/infrastructure/env/tty-detection.ts`
- Create: `src/infrastructure/env/tty-detection.test.ts`

- [ ] **Step 8.1: Write failing tests**

Create `src/infrastructure/env/tty-detection.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { resolveInteractivity } from './tty-detection.js';

describe('resolveInteractivity — color', () => {
  it('honors --no-color over everything', () => {
    const r = resolveInteractivity({
      flags: { color: false },
      env: { FORCE_COLOR: '1', NO_COLOR: undefined, CI: undefined },
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.color).toBe(false);
  });

  it('honors --color over env', () => {
    const r = resolveInteractivity({
      flags: { color: true },
      env: { NO_COLOR: '1', FORCE_COLOR: undefined, CI: undefined },
      stdoutIsTTY: false,
      stdinIsTTY: false,
    });
    expect(r.color).toBe(true);
  });

  it('respects FORCE_COLOR when no flag set', () => {
    const r = resolveInteractivity({
      flags: {},
      env: { FORCE_COLOR: '1', NO_COLOR: undefined, CI: undefined },
      stdoutIsTTY: false,
      stdinIsTTY: false,
    });
    expect(r.color).toBe(true);
  });

  it('respects NO_COLOR when no flag set', () => {
    const r = resolveInteractivity({
      flags: {},
      env: { NO_COLOR: '1', FORCE_COLOR: undefined, CI: undefined },
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.color).toBe(false);
  });

  it('falls back to TTY when no flag/env', () => {
    const r = resolveInteractivity({
      flags: {},
      env: { NO_COLOR: undefined, FORCE_COLOR: undefined, CI: undefined },
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.color).toBe(true);
  });
});

describe('resolveInteractivity — interactive', () => {
  it('--no-interactive forces off even on TTY', () => {
    const r = resolveInteractivity({
      flags: { noInteractive: true },
      env: {},
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.interactive).toBe(false);
  });

  it('--ci implies non-interactive', () => {
    const r = resolveInteractivity({
      flags: { ci: true },
      env: {},
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.interactive).toBe(false);
  });

  it('CI=1 env implies non-interactive', () => {
    const r = resolveInteractivity({
      flags: {},
      env: { CI: '1' },
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.interactive).toBe(false);
  });

  it('TTY both directions ⇒ interactive', () => {
    const r = resolveInteractivity({
      flags: {},
      env: {},
      stdoutIsTTY: true,
      stdinIsTTY: true,
    });
    expect(r.interactive).toBe(true);
  });

  it('stdin not a TTY ⇒ non-interactive', () => {
    const r = resolveInteractivity({
      flags: {},
      env: {},
      stdoutIsTTY: true,
      stdinIsTTY: false,
    });
    expect(r.interactive).toBe(false);
  });
});
```

- [ ] **Step 8.2: Run to confirm failure**

Run: `npx vitest run src/infrastructure/env/tty-detection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8.3: Create `src/infrastructure/env/tty-detection.ts`**

```typescript
/**
 * Resolve whether to run interactively and whether to emit color, given the
 * CLI flags + env vars + TTY state. Pure: caller passes everything explicitly.
 *
 * Precedence:
 *   1. Explicit CLI flag
 *   2. Env var (NO_COLOR, FORCE_COLOR, CI)
 *   3. TTY detection
 */

export interface InteractivityFlags {
  readonly noInteractive?: boolean;
  readonly ci?: boolean;
  readonly color?: boolean;
}

export interface InteractivityInput {
  readonly flags: InteractivityFlags;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly stdoutIsTTY: boolean;
  readonly stdinIsTTY: boolean;
}

export interface InteractivityDecision {
  readonly interactive: boolean;
  readonly color: boolean;
}

export function resolveInteractivity(
  input: InteractivityInput,
): InteractivityDecision {
  const { flags, env, stdoutIsTTY, stdinIsTTY } = input;

  const interactive = (() => {
    if (flags.noInteractive === true) return false;
    if (flags.ci === true) return false;
    if (env.CI !== undefined && env.CI !== '') return false;
    return stdoutIsTTY && stdinIsTTY;
  })();

  const color = (() => {
    if (flags.color === false) return false;
    if (flags.color === true) return true;
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
    if (env.NO_COLOR !== undefined) return false;
    return stdoutIsTTY;
  })();

  return { interactive, color };
}
```

- [ ] **Step 8.4: Run the tests**

Run: `npx vitest run src/infrastructure/env/tty-detection.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 8.5: Commit**

```bash
git add src/infrastructure/env/
git commit -m "feat(env): tty + color detection with CLI/env/TTY precedence"
```

---

## Task 9: New diagnostic registry entries for wizard

**Files:**
- Modify: `src/domain/diagnostics/registry.ts` (add three entries)

- [ ] **Step 9.1: Find the registry file's emit-test**

Run: `npx vitest run src/domain/conversion-mapping/setup-coverage.test.ts`
Expected: PASS today.

- [ ] **Step 9.2: Append three entries to `REGISTRY_ENTRIES`**

In `src/domain/diagnostics/registry.ts`, before the closing `];` of `REGISTRY_ENTRIES`, append:

```typescript
  {
    id: 'wizard-decision-applied',
    severity: 'info',
    description:
      'A wizard answer (or equivalent CLI flag) overrode a converter default. Recorded in MIGRATION_NOTES.md so the run is reproducible without re-running the wizard.',
    fix:
      'No action required. To restore the default, remove the corresponding flag from the next invocation.',
  },
  {
    id: 'wizard-non-interactive-fallback',
    severity: 'info',
    description:
      'The wizard was skipped because stdout/stdin are not TTYs (or --no-interactive / --ci was passed) and `--yes` was not provided.',
    fix:
      'Pass `--yes` to accept defaults non-interactively, or run from a TTY to use the wizard.',
  },
  {
    id: 'wizard-cancelled',
    severity: 'info',
    description:
      'The user cancelled the wizard (Ctrl+C). No conversion was performed.',
    fix:
      'Re-run the wizard, or invoke with explicit flags + `--yes` to skip prompts.',
  },
```

- [ ] **Step 9.3: Run the registry-coverage test**

Run: `npx vitest run src/domain/conversion-mapping/setup-coverage.test.ts src/domain/diagnostics/`
Expected: PASS — entries are well-formed, no duplicate ids.

- [ ] **Step 9.4: Run the full test suite to catch any registry-strict checks**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add src/domain/diagnostics/registry.ts
git commit -m "feat(diagnostics): register wizard-decision-applied, -non-interactive-fallback, -cancelled"
```

---

## Task 10: Wire new wizard options into `convert-site.ts` API (behavior changes)

**Why now:** the parser already accepts the flags, but the converter ignores most of them. Each new behavior switch lands as its own sub-task with its own test.

This is the largest task by surface area. We split into atomic sub-tasks, one per behavior switch. Each follows: test → fail → minimum impl → pass → commit.

**Files (per sub-task):**
- Modify: `src/interface/api/convert-site.ts` to accept and thread the new option
- Modify or add: the relevant `use-cases/serialize-config/*.ts` or `use-cases/normalize/*.ts`
- Tests: co-located + targeted integration test

For brevity, the sub-tasks list the test to add and the implementation pointer. Each ends with a commit.

### Sub-task 10a: `--no-links-validator`

- [ ] Add test in `src/use-cases/serialize-config/astro-config.test.ts`:

```typescript
  it('omits starlight-links-validator when enableLinksValidator is false', () => {
    const out = serializeAstroConfig({
      siteName: 's', siteDescription: null, siteUrl: null,
      sidebar: [], detectedFeatures: [], redirects: [],
      enableLinksValidator: false,
      extraCssEntries: [], extraJsEntries: [],
    });
    expect(out).not.toContain('starlight-links-validator');
  });
```

- [ ] Run; fails today (always emits validator).
- [ ] In `serialize-config/astro-config.ts`, gate the validator import + plugin entry on `enableLinksValidator`.
- [ ] In `interface/api/convert-site.ts`, add `linksValidator?: boolean` to `ConvertSiteFromDiskInput`, default true, thread to `enableLinksValidator`.
- [ ] In `interface/cli/main.ts`, when handling `'convert'` Command, pass `linksValidator: command.linksValidator ?? true`.
- [ ] Run `npx vitest run src/use-cases/serialize-config/astro-config.test.ts`. Expected PASS.
- [ ] `npm test`. Expected PASS.
- [ ] Commit:

```bash
git add src/use-cases/serialize-config/astro-config.ts src/use-cases/serialize-config/astro-config.test.ts src/interface/api/convert-site.ts src/interface/cli/main.ts
git commit -m "feat(convert): --no-links-validator omits starlight-links-validator"
```

### Sub-task 10b: `--tabs=html` forces HTML even when content.tabs.link is set

- [ ] Add test in `tests/integration/api-convert-site.test.ts` that runs convertSiteFromDisk with `tabs: 'html'` against a fixture with `content.tabs.link` enabled and asserts no `<Tabs syncKey>` appears in output.
- [ ] Run; fails today (always emits MDX tabs when feature flag is set).
- [ ] In `convert-site.ts`, accept `tabs?: 'mdx' | 'html'`, default `null`. Compute `emitMdxTabs = tabs === 'mdx' ? true : tabs === 'html' ? false : hasTabsLink`.
- [ ] Thread to `convertSite({ emitMdxTabs })`.
- [ ] In `main.ts`, pass `tabs: command.tabs`.
- [ ] Run integration test. Expected PASS.
- [ ] Commit: `feat(convert): --tabs=mdx|html overrides theme.features auto-detect`

### Sub-task 10c: `--no-rss` skips rss endpoint even if plugin present

- [ ] Add test in `tests/integration/api-convert-site.test.ts` with `rssEnabled: false` override; assert `src/pages/rss.xml.ts` is NOT in the output file map.
- [ ] In `convert-site.ts`, accept `rss?: boolean`, default null. Replace `const rssEnabled = allFeatures.includes('rss')` with `const rssEnabled = rss === false ? false : rss === true ? true : allFeatures.includes('rss')`.
- [ ] Thread + main.ts wiring.
- [ ] Commit: `feat(convert): --no-rss skips rss endpoint scaffold`

### Sub-task 10d: `--palette=skip` / `--palette=custom` / `--palette=translate`

- [ ] Test that `palette: 'skip'` → no `:root` block in stylesheet.
- [ ] In `serialize-config/styles.ts`, accept the palette strategy explicitly; current code already handles `null`/`isCustom` — extend to honor explicit `'skip'`.
- [ ] Wire from `convert-site.ts` + `main.ts`.
- [ ] Commit.

### Sub-task 10e: `--cards=mdx` — emit `<Card>`/`<CardGrid>` MDX

- [ ] Behavior change is significant and may need a new transform path. If too large for one commit, **stub it**: accept the flag, emit a diagnostic `wizard-decision-applied` saying "MDX cards requested but not yet implemented in this build; falling back to HTML." Track in v2.
- [ ] Test that the diagnostic is emitted; no behavior regression for default.
- [ ] Commit.

### Sub-task 10f: `--no-smart-symbols` / `--no-emoji-shortcodes` / `--no-inline-marks` / `--no-auto-append`

For each, a single sub-task:

- [ ] Test: convertSiteFromDisk with the corresponding override produces output where the rewriter did NOT fire.
- [ ] In `convert-site.ts`, plumb the boolean to the call site of the corresponding normalizer (`use-cases/normalize/smartsymbols.ts`, `emoji.ts`, `inline-marks.ts`, `convert-site/convert.ts:141` for autoAppend).
- [ ] Commit per flag.

### Sub-task 10g: `--keep-explicit-heading-ids`

- [ ] Test: input `# Title { #anchor }` with the flag set produces output containing `<a id="anchor"></a>`.
- [ ] Modify `normalize/heading-attr-list.ts` to emit the anchor when the option is true (instead of silently dropping). Default behavior (drop) is preserved when the flag is unset.
- [ ] Commit.

### Sub-task 10h: `--snippet-max-depth=<N>` and `--snippet-dedent-subsections`

- [ ] Test: snippet expansion with `maxDepth: 4` aborts cycles deeper than 4 (existing test infra in `use-cases/expand-snippets/expand.test.ts`).
- [ ] Plumb both options through `convertSite({ snippetMaxDepth, snippetDedentSubsections })`.
- [ ] Commit.

### Sub-task 10i: `--config-format=ts` emits `astro.config.ts`

- [ ] Test: `convertSiteFromDisk({ configFormat: 'ts' })` writes `astro.config.ts` (not `.mjs`); content is the same source.
- [ ] In `convert-site.ts` `writeOutputs`, replace the hardcoded `'astro.config.mjs'` with the parameterized name.
- [ ] Commit.

### Sub-task 10j: `--package-name`

- [ ] Test in `serialize-config/package-json.test.ts`: passing `packageName: 'my-pkg'` produces a `package.json` whose `name` is `'my-pkg'` instead of the slugified site name.
- [ ] In `serialize-config/package-json.ts`, accept `packageName?: string` on the input; use it directly when set, otherwise fall back to the existing slugify-from-siteName path.
- [ ] Thread `packageName` from `convert-site.ts` (new field on `ConvertSiteFromDiskInput`) and from `main.ts` (`packageName: command.packageName`).
- [ ] Commit: `feat(convert): --package-name overrides slugified package.json name`

### Sub-task 10k: `--logo-replaces-title`

- [ ] Test in `serialize-config/astro-config.test.ts`: passing `logoReplacesTitle: true` with a logo present produces `logo: { src: '...', replacesTitle: true }` in the emitted config.
- [ ] In `serialize-config/astro-config.ts`, the `logo` block currently emits `{ src }`; extend to spread `replacesTitle: true` when the option is set.
- [ ] Thread from `convert-site.ts` (new field) and `main.ts` (`logoReplacesTitle: command.logoReplacesTitle`).
- [ ] Commit: `feat(convert): --logo-replaces-title sets Starlight logo.replacesTitle`

### Sub-task 10l: `--mike-versions`

- [ ] Test: `convertSiteFromDisk({ mikeVersions: ['v1','v2','latest'] })` with the `mike` plugin in `mkdocs.yml` emits the literal `[{ slug: 'v1' }, { slug: 'v2' }, { slug: 'latest' }]` as the `versions` array (replacing the hardcoded `[{ slug: '2.0' }]` placeholder at `astro-config.ts:200`).
- [ ] In `serialize-config/astro-config.ts`, parameterize the versions list; default to `[]` when not provided.
- [ ] Thread from `convert-site.ts` and `main.ts`.
- [ ] Commit: `feat(convert): --mike-versions replaces hardcoded mike slug placeholder`

### Sub-task 10m: `--locale` (locale carryover)

- [ ] Test: `convertSiteFromDisk` with `locales: ['en','fr']` against a project whose i18n plugin lists `en, fr, de` produces an `i18n.locales` config containing only `en` and `fr` (filters out non-selected locales). When `locales` is undefined or empty, behavior is unchanged (all detected locales carried).
- [ ] In `convert-site.ts`, after the `extractI18nConfig` / `extractI18nLocales` calls, intersect the detected locales with the user's selection if non-empty.
- [ ] Thread + main.ts wiring.
- [ ] Commit: `feat(convert): --locale filters carried-over i18n locales to the user's selection`

### Sub-task 10n: `--extra-asset` (extra_css/extra_javascript carryover)

- [ ] Test: with `extraAssets: ['custom.css']` and a project whose `extra_css: [custom.css, vendor.css]`, only `custom.css` is carried into the output `public/` and referenced from `astro.config.mjs`.
- [ ] In `convert-site.ts`, before computing `extraCssEntries` / `extraJsEntries`, filter `extraAssets.css` and `extraAssets.js` against the user's selection (if non-empty).
- [ ] Thread + main.ts wiring.
- [ ] Commit: `feat(convert): --extra-asset filters extra_css / extra_javascript carryover`

> Each sub-task above is a real commit. Total: ~12 commits in Task 10. Skip any sub-task whose underlying behavior change you decide to defer to v2 — record the deferral as a `wizard-decision-applied` info diagnostic with "not yet implemented" wording so the user sees a clear signal.

---

## Task 11: `infrastructure/prompts/clack-prompter.ts` (lazy adapter)

**Files:**
- Create: `src/infrastructure/prompts/clack-prompter.ts`
- Create: `src/infrastructure/prompts/clack-prompter.smoke.test.ts`

- [ ] **Step 11.1: Add `@clack/prompts` and `picocolors` to deps**

Edit `package.json`, append to `"dependencies"`:

```json
    "@clack/prompts": "^0.7.0",
    "picocolors": "^1.0.0"
```

Run: `npm install`. Expected: deps installed, `package-lock.json` updated.

- [ ] **Step 11.2: Smoke test**

Create `src/infrastructure/prompts/clack-prompter.smoke.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createClackPrompter } from './clack-prompter.js';

describe('createClackPrompter', () => {
  it('returns an object implementing every Prompter method', () => {
    const p = createClackPrompter();
    expect(typeof p.intro).toBe('function');
    expect(typeof p.outro).toBe('function');
    expect(typeof p.note).toBe('function');
    expect(typeof p.text).toBe('function');
    expect(typeof p.confirm).toBe('function');
    expect(typeof p.select).toBe('function');
    expect(typeof p.multiselect).toBe('function');
  });
});
```

- [ ] **Step 11.3: Run; fails (module not found)**

Run: `npx vitest run src/infrastructure/prompts/clack-prompter.smoke.test.ts`
Expected: FAIL.

- [ ] **Step 11.4: Create `src/infrastructure/prompts/clack-prompter.ts`**

```typescript
/**
 * @clack/prompts adapter implementing the Prompter port.
 *
 * Cancellation: every clack helper returns a special symbol (detected via
 * `isCancel`) on Ctrl+C; we map it to `null` per the Prompter contract.
 *
 * Lazy-loadable: this module imports @clack/prompts at module load. Callers
 * who don't enter the wizard branch must not import this module — the launcher
 * uses dynamic `await import('./clack-prompter.js')` to keep the cold path
 * free of clack/picocolors cost.
 */

import {
  intro as clackIntro,
  outro as clackOutro,
  note as clackNote,
  text as clackText,
  confirm as clackConfirm,
  select as clackSelect,
  multiselect as clackMultiselect,
  isCancel,
} from '@clack/prompts';
import pc from 'picocolors';
import type {
  ConfirmOptions,
  MultiselectOptions,
  Prompter,
  SelectOptions,
  TextOptions,
} from '../../domain/wizard/ports/prompter.js';

export function createClackPrompter(): Prompter {
  return {
    intro: (title: string) => clackIntro(pc.bgCyan(pc.black(` ${title} `))),
    outro: (message: string) => clackOutro(message),
    note: (body: string, title?: string) => clackNote(body, title),
    text: async (o: TextOptions) => {
      const result = await clackText({
        message: o.message,
        initialValue: o.initialValue,
        placeholder: o.placeholder,
        validate: o.validate,
      });
      return isCancel(result) ? null : (result as string);
    },
    confirm: async (o: ConfirmOptions) => {
      const result = await clackConfirm({
        message: o.message,
        initialValue: o.initialValue,
      });
      return isCancel(result) ? null : (result as boolean);
    },
    select: async <V extends string>(o: SelectOptions<V>) => {
      const result = await clackSelect({
        message: o.message,
        options: o.options as Array<{ value: V; label: string; hint?: string }>,
        initialValue: o.initialValue,
      });
      return isCancel(result) ? null : (result as V);
    },
    multiselect: async <V extends string>(o: MultiselectOptions<V>) => {
      const result = await clackMultiselect({
        message: o.message,
        options: o.options as Array<{ value: V; label: string; hint?: string }>,
        initialValues: o.initialValues as V[] | undefined,
        required: o.required,
      });
      return isCancel(result) ? null : (result as ReadonlyArray<V>);
    },
  };
}
```

- [ ] **Step 11.5: Run smoke test**

Run: `npx vitest run src/infrastructure/prompts/clack-prompter.smoke.test.ts`
Expected: PASS.

- [ ] **Step 11.6: Commit**

```bash
git add package.json package-lock.json src/infrastructure/prompts/
git commit -m "feat(prompts): @clack/prompts + picocolors adapter (lazy-loadable)"
```

---

## Task 12: `interface/cli/wizard-runner.ts` + main.ts wizard branch

**Files:**
- Create: `src/interface/cli/wizard-runner.ts`
- Modify: `src/interface/cli/main.ts`

- [ ] **Step 12.1: Add failing integration test for the empty-argv → wizard branch**

Create `tests/integration/wizard-yes-mode.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/interface/cli/main.js';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('--yes mode (non-interactive equivalent of wizard defaults)', () => {
  it('runs convert successfully against a minimal mkdocs project with --yes', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-yes-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: Test\n');
    writeFileSync(join(project, 'docs', 'index.md'), '# Hello\n');

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-out-'));
    const lines: string[] = [];
    const err: string[] = [];
    const exit = await runCli([project, out, '--yes'], {
      stdout: (l) => lines.push(l),
      stderr: (l) => err.push(l),
    });
    expect(exit).toBe(0);
    expect(() =>
      readFileSync(join(out, 'src', 'content', 'docs', 'index.md'), 'utf8'),
    ).not.toThrow();
  });
});
```

- [ ] **Step 12.2: Run; should fail (current main.ts doesn't recognize --yes; or it does but emits no different behavior — check)**

Run: `npx vitest run tests/integration/wizard-yes-mode.test.ts`
Expected: PASS — `--yes` is currently a no-op but the convert path still works. **If it fails, it's revealing a real issue.** This test is a regression guard.

- [ ] **Step 12.3: Add failing test for `wizard-non-interactive-fallback` diagnostic when CI=1 and no --yes**

Create `tests/integration/wizard-non-interactive.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/interface/cli/main.js';

describe('non-interactive without --yes', () => {
  it('exits 2 when CI is set and no --yes provided in zero-arg invocation', async () => {
    const oldCi = process.env.CI;
    process.env.CI = '1';
    try {
      const lines: string[] = [];
      const err: string[] = [];
      const exit = await runCli([], {
        stdout: (l) => lines.push(l),
        stderr: (l) => err.push(l),
      });
      expect(exit).toBe(2);
      expect(err.join('\n')).toMatch(/--yes/i);
    } finally {
      if (oldCi === undefined) delete process.env.CI;
      else process.env.CI = oldCi;
    }
  });
});
```

- [ ] **Step 12.4: Run; expect failure today (zero argv currently exits 2 with "missing project directory")**

Run: `npx vitest run tests/integration/wizard-non-interactive.test.ts`
Expected: FAIL or PASS depending on current message. Either way, the message will improve after this task.

- [ ] **Step 12.5: Create `src/interface/cli/wizard-runner.ts`**

```typescript
/**
 * Wires the lazy clack adapter into the pure runWizard orchestrator and
 * translates the result into a ConvertCommand the existing convert path can
 * consume.
 *
 * The clack adapter is imported dynamically so users running with --yes or in
 * CI never load @clack/prompts or picocolors.
 */

import { resolveInteractivity } from '../../infrastructure/env/tty-detection.js';
import { deriveDefaults } from '../../use-cases/wizard/derive-defaults.js';
import { runWizard } from '../../use-cases/wizard/run-wizard.js';
import { answersToFlags } from '../../use-cases/wizard/answers-to-flags.js';
import { parseArgs } from './parse-args.js';
import type { Command } from './parse-args.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { parseMkdocsConfig } from '../../use-cases/config/parse-mkdocs.js';
import { explainConversion } from '../../use-cases/explain-conversion/explain.js';
import type { ConversionPlan } from '../../domain/wizard/plan.js';
import type { CliIo } from './main.js';

export interface WizardRunResult {
  readonly kind: 'success';
  readonly command: Extract<Command, { kind: 'convert' }>;
  readonly equivalentFlags: ReadonlyArray<string>;
}
export interface WizardRunCancelled {
  readonly kind: 'cancelled';
}
export interface WizardRunNonInteractive {
  readonly kind: 'non-interactive';
}

export async function runWizardFlow(
  projectDirHint: string,
  io: CliIo,
): Promise<WizardRunResult | WizardRunCancelled | WizardRunNonInteractive> {
  const env = process.env;
  const decision = resolveInteractivity({
    flags: {},
    env,
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    stdinIsTTY: Boolean(process.stdin.isTTY),
  });
  if (!decision.interactive) return { kind: 'non-interactive' };

  // Lazy-import clack here so the non-interactive path never pays for it.
  const { createClackPrompter } = await import(
    '../../infrastructure/prompts/clack-prompter.js'
  );
  const prompter = createClackPrompter();

  // Step 1: prompt for the project dir *before* loading mkdocs.yml. The
  // ConversionPlan depends on the chosen dir, so this prompt cannot live
  // inside runWizard (which takes the plan as input).
  prompter.intro('mkdocs-material-to-starlight');
  const projectDir = await prompter.text({
    message: 'Project directory (containing mkdocs.yml)',
    initialValue: projectDirHint,
  });
  if (projectDir === null) return { kind: 'cancelled' };

  // Step 2: load + parse mkdocs.yml from the chosen dir.
  const yaml = createJsYamlDecoder();
  const configPath = join(projectDir, 'mkdocs.yml');
  let configText: string;
  try {
    configText = await readFile(configPath, 'utf8');
  } catch {
    io.stderr(`error: could not read mkdocs.yml at ${configPath}`);
    return { kind: 'non-interactive' };
  }
  const decoded = yaml.decode(configText);
  if (!decoded.ok) {
    io.stderr(`error: yaml-decode-failed: ${decoded.error.message}`);
    return { kind: 'non-interactive' };
  }
  const config = parseMkdocsConfig(decoded.value);
  if (!config.ok) {
    io.stderr(`error: config-invalid: ${config.error.message}`);
    return { kind: 'non-interactive' };
  }

  // Step 3: build the plan and defaults.
  const plan: ConversionPlan = {
    config: config.value,
    mappingRows: explainConversion(config.value),
    detectedExtraCss: [],
    detectedExtraJs: [],
    detectedLocales: [],
    snippetCandidateDirs: [],
  };
  const defaults = deriveDefaults(config.value, {
    userAgent: env.npm_config_user_agent,
    env,
  });

  // Step 4: run the rest of the wizard (outputDir, packageManager, Tier 1, Tier 2).
  const result = await runWizard({ projectDir, plan, defaults, prompter });
  if (!result.ok) return { kind: 'cancelled' };

  const flags = answersToFlags(result.value);
  const reparsed = parseArgs(flags);
  if (reparsed.kind !== 'convert') {
    io.stderr(`error: wizard produced an invalid command: ${JSON.stringify(reparsed)}`);
    return { kind: 'cancelled' };
  }
  return { kind: 'success', command: reparsed, equivalentFlags: flags };
}
```

- [ ] **Step 12.6: Modify `src/interface/cli/main.ts` to branch into the wizard**

Add at the top of `runCli`, before the existing `parseArgs(argv)` call:

```typescript
  // Zero-arg launch on a TTY → wizard
  if (argv.length === 0) {
    const decision = resolveInteractivity({
      flags: {},
      env: process.env,
      stdoutIsTTY: Boolean(process.stdout.isTTY),
      stdinIsTTY: Boolean(process.stdin.isTTY),
    });
    if (!decision.interactive) {
      io.stderr(
        'error: no arguments and not a TTY. Pass --yes to accept defaults, or run from a terminal to use the wizard.',
      );
      return 2;
    }
    const { runWizardFlow } = await import('./wizard-runner.js');
    const wizard = await runWizardFlow(process.cwd(), io);
    if (wizard.kind === 'cancelled') return 130;
    if (wizard.kind === 'non-interactive') return 2;
    io.stdout(
      `Equivalent command: mkdocs-material-to-starlight ${wizard.equivalentFlags.join(' ')}`,
    );
    return runConvert(wizard.command, io, overrides);
  }
```

Add the import at the top of `main.ts`:

```typescript
import { resolveInteractivity } from '../../infrastructure/env/tty-detection.js';
```

- [ ] **Step 12.7: Run integration tests**

Run: `npx vitest run tests/integration/wizard-yes-mode.test.ts tests/integration/wizard-non-interactive.test.ts`
Expected: both PASS.

- [ ] **Step 12.8: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 12.9: Commit**

```bash
git add src/interface/cli/wizard-runner.ts src/interface/cli/main.ts tests/integration/wizard-yes-mode.test.ts tests/integration/wizard-non-interactive.test.ts
git commit -m "feat(cli): wire interactive wizard branch with lazy clack import"
```

---

## Task 13: Force-overwrite of non-empty output dir

**Files:**
- Modify: `src/interface/api/convert-site.ts` — add idempotency check at top of `convertSiteFromDisk`
- Create: `tests/integration/wizard-force-overwrite.test.ts`

- [ ] **Step 13.1: Failing test**

Create `tests/integration/wizard-force-overwrite.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/interface/cli/main.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('non-empty output dir', () => {
  function setup() {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-fo-p-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: T\n');
    writeFileSync(join(project, 'docs', 'index.md'), '# H\n');
    const out = mkdtempSync(join(tmpdir(), 'mk2sl-fo-o-'));
    writeFileSync(join(out, 'pre-existing.txt'), 'preserved');
    return { project, out };
  }

  it('fails non-interactively without --force', async () => {
    const { project, out } = setup();
    const err: string[] = [];
    const exit = await runCli([project, out, '--yes'], {
      stdout: () => {},
      stderr: (l) => err.push(l),
    });
    expect(exit).toBe(1);
    expect(err.join('\n')).toMatch(/--force/);
  });

  it('succeeds with --force', async () => {
    const { project, out } = setup();
    const exit = await runCli([project, out, '--yes', '--force'], {
      stdout: () => {},
      stderr: () => {},
    });
    expect(exit).toBe(0);
  });
});
```

- [ ] **Step 13.2: Run; first case may pass (it always overwrites today), second passes too**

Run: `npx vitest run tests/integration/wizard-force-overwrite.test.ts`
Expected: FAIL on the "fails without --force" case — current behavior silently writes.

- [ ] **Step 13.3: Add a guard in `convert-site.ts`**

Near the top of `convertSiteFromDisk` (after dir existence checks), add:

```typescript
import { readdir } from 'node:fs/promises';

// ...

  // Idempotency guard: if output dir exists and is non-empty, demand --force.
  let existing: string[] = [];
  try {
    existing = await readdir(input.outputDir);
  } catch {
    // dir doesn't exist — fine
  }
  if (existing.length > 0 && input.force !== true) {
    return err({
      code: 'output-not-empty',
      message: `Output directory ${input.outputDir} is not empty. Re-run with --force to overwrite, or pick a different output directory.`,
    });
  }
```

Add `force?: boolean` to `ConvertSiteFromDiskInput`. Add `'output-not-empty'` to the `code` union of `ConvertSiteFromDiskError`.

In `main.ts`, when calling `convertSiteFromDisk`, pass `force: command.force`.

- [ ] **Step 13.4: Run integration test**

Run: `npx vitest run tests/integration/wizard-force-overwrite.test.ts`
Expected: PASS.

- [ ] **Step 13.5: Commit**

```bash
git add src/interface/api/convert-site.ts src/interface/cli/main.ts tests/integration/wizard-force-overwrite.test.ts
git commit -m "feat(convert): refuse to overwrite non-empty output dir without --force"
```

---

## Task 14: Update help text + bump version

**Files:**
- Modify: `src/interface/cli/main.ts` (HELP_TEXT + VERSION)
- Modify: `package.json` (version)

- [ ] **Step 14.1: Update help text**

Replace `HELP_TEXT` in `main.ts` with the full grouped help (Convert / Wizard / Output / Advanced sections). Keep within ~80 cols. Concrete content:

```typescript
const HELP_TEXT = `mkdocs-material-to-starlight — convert a MkDocs Material site to Astro Starlight

Usage:
  mkdocs-material-to-starlight                                  (interactive wizard)
  mkdocs-material-to-starlight <project-dir> <output-dir> [options]
  mkdocs-material-to-starlight <project-dir> --explain
  mkdocs-material-to-starlight compare <baseline-url> <converted-url> [options]

General:
  -y, --yes                Accept defaults non-interactively (CI-safe)
  --no-interactive         Disable prompts; fail if required args missing
  --ci                     Implies --no-interactive; disables color
  -f, --force              Overwrite a non-empty output directory
  -q, --quiet              Suppress info logs
  --json                   Emit conversion plan/report as JSON to stdout
  --color / --no-color     Override TTY/env color detection
  -C, --dir <path>         Output directory (alternative to positional[1])
  -h, --help               Show this help
  --version                Print the version

Convert:
  --check                  Run \`astro check\` after conversion
  --no-check               Skip astro check
  --check-timeout <ms>     Override astro-check timeout (default 5min)
  --dry-run                In-memory only; no files written
  --snippet-base-path <p>  Resolve PyMdown snippets here (repeatable)
  --package-manager <pm>   npm | pnpm | yarn | bun (next-steps hint only)

Wizard decisions (Tier 1 — also surfaced as flags):
  --tabs <mdx|html>        Tabs strategy when content.tabs.link is set
  --sidebar-topics         Install starlight-sidebar-topics for nav.tabs
  --no-sidebar-topics      Skip the topics split
  --rss / --no-rss         Generate / skip src/pages/rss.xml.ts
  --mike-versions <v>      Versions slug list (repeatable)
  --palette <translate|skip|custom>
  --extra-asset <path>     Carry over (repeatable; default: all detected)
  --locale <code>          Locale to carry over (repeatable)

Advanced (Tier 2):
  --no-links-validator           Skip starlight-links-validator
  --expressive-code-theme <name> Override Shiki theme pair
  --cards <mdx|html|skip>        Card / grid output format
  --mdx-mode <auto|always|never> .mdx promotion strategy
  --logo-replaces-title          Set Starlight logo.replacesTitle: true
  --admonition-map <path.json>   Override 12→4 admonition collapse
  --keep-explicit-heading-ids    Emit <a id="…"> instead of dropping
  --no-smart-symbols             Disable (c)/(tm) etc rewrites
  --no-emoji-shortcodes          Disable :emoji: rewrites
  --no-inline-marks              Disable ==mark== / ~sub~ / ^sup^
  --no-auto-append               Don't append auto_append to every page
  --snippet-max-depth <N>        Snippet recursion limit (default 8)
  --snippet-dedent-subsections   Enable PyMdown dedent_subsections
  --suppress <ruleId>            Mute info diagnostic (repeatable)
  --config-format <mjs|ts>       astro.config extension
  --package-name <name>          Override slugified package name

Subcommands:
  compare <baseline-url> <converted-url> [--pages a,b,c]
                                 [--threshold 0.01] [--report file.md]
                                 Visual diff (requires Playwright + pixelmatch)

Exit codes: 0 success, 1 runtime, 2 usage, 130 cancelled.
`;
```

- [ ] **Step 14.2: Bump version**

In `package.json`, change `"version": "0.0.0"` to `"version": "0.1.0"`.

In `main.ts`, change `const VERSION = '0.0.0'` to `'0.1.0'`.

- [ ] **Step 14.3: Run tests**

Run: `npm test`
Expected: PASS (the version test in main.test.ts may need its expected string updated — change to match `'0.1.0'`).

- [ ] **Step 14.4: Build**

Run: `npm run build`
Expected: success, dist/ updated.

- [ ] **Step 14.5: Manual smoke test (optional but recommended)**

Run: `node dist/interface/cli/bin.js --help`
Expected: the new help text prints in full.

Run from a TTY: `node dist/interface/cli/bin.js`
Expected: the wizard intro appears (or, if not in TTY, the "no arguments and not a TTY" message).

- [ ] **Step 14.6: Commit**

```bash
git add package.json src/interface/cli/main.ts src/interface/cli/main.test.ts
git commit -m "feat: ship v0.1.0 with interactive wizard + grouped --help"
```

---

## Task 15: README + idempotency property test extension

**Files:**
- Modify: `README.md` (top-level usage section gets a wizard demo block)
- Modify: existing idempotency property test (extend fixture set to cover `--yes` mode)

- [ ] **Step 15.1: Update `README.md`**

Add this section near the top, after the existing one-liner installation:

```markdown
## Quick start

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
```

- [ ] **Step 15.2: Find the idempotency property test and extend it**

Search: `npx vitest run --reporter=verbose 2>&1 | rg -i 'idempot'`
Locate the test that runs `convert(convert(x))`. Extend it to also assert that running `--yes` against the same fixture set produces output identical to the all-defaults wizard path.

If the test runs through `convertSiteFromDisk` directly, the extension is: assert `convert(input, { /* all defaults */ }) === convert(input)`.

- [ ] **Step 15.3: Run**

Run: `npm test`
Expected: PASS.

- [ ] **Step 15.4: Commit**

```bash
git add README.md tests/
git commit -m "docs: README quick-start with wizard, extend idempotency test for --yes parity"
```

---

## Final acceptance

After all tasks, the following must hold:

- [ ] `npm test && npm run typecheck && npm run build` — all green.
- [ ] `node dist/interface/cli/bin.js --help` shows the grouped help.
- [ ] `node dist/interface/cli/bin.js` from a TTY launches the wizard.
- [ ] `node dist/interface/cli/bin.js ./fixture-project ./out --yes` performs the conversion non-interactively.
- [ ] `CI=1 node dist/interface/cli/bin.js` exits 2 with a message naming `--yes`.
- [ ] `node dist/interface/cli/bin.js ./fixture-project ./pre-populated-out --yes` exits 1 with a message naming `--force`.
- [ ] Idempotency property test still passes on the full fixture corpus, including `--yes` runs.
- [ ] Total new dependencies: `@clack/prompts`, `picocolors`. No others.

---

## Notes for the executing agent

- **TDD is non-negotiable** (CLAUDE.md). Each task explicitly orders test → fail-confirm → implementation → pass → commit. Don't merge those steps.
- **Diagnostics over throws** (CLAUDE.md). When extending `convert-site.ts` for new options, every failure mode goes through `Result.err({code, message})`, never `throw`.
- **Layer boundaries** are load-bearing. `domain/wizard/` imports stdlib only. `use-cases/wizard/` imports `domain/`. **No** `@clack/prompts` import outside `infrastructure/prompts/clack-prompter.ts`.
- **Two registries** are load-bearing (CLAUDE.md). New `wizard-*` ruleIds in `domain/diagnostics/registry.ts` must be added before any code emits them. Task 9 covers this.
- **No `utils.ts`/`helpers.ts`** — every new file in this plan is named by its domain role.
- **Function & file size**: 80-line / 200-line soft caps. The biggest new file (`run-wizard.ts` after Task 6b) approaches but stays under the 200-line ceiling. If it overruns, split per-Tier into separate files (`tier0.ts`, `tier1.ts`, `tier2.ts`) under `use-cases/wizard/`.

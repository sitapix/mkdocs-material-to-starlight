/**
 * CLI entry point. Wires the argument parser, the convert-site API, and the
 * diagnostic formatter into a single async function.
 *
 * Pure given the supplied IO callbacks — no `console.log`, no `process.exit`
 * here. The thin shell `bin.ts` (created at build time) calls `runCli` with
 * the real argv and prints to real stdout/stderr.
 *
 * Exit codes follow Unix convention:
 *   0 — success
 *   1 — runtime failure (config invalid, write failed, etc.)
 *   2 — usage error (bad arguments)
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  getTranslationDepth,
  type MappingRow,
  type TranslationDepth,
} from '../../domain/conversion-mapping/table.js';
import { getAllRegisteredRuleIds } from '../../domain/diagnostics/registry.js';
import type { BrowserAutomator } from '../../domain/ports/browser-automator.js';
import type { ImageDiffer } from '../../domain/ports/image-differ.js';
import type { ProcessRunner } from '../../domain/ports/process-runner.js';
import type { DiffPair } from '../../domain/visual-diff/page-diff.js';
import { createPlaywrightAutomator } from '../../infrastructure/browser/playwright-automator.js';
import { resolveInteractivity } from '../../infrastructure/env/tty-detection.js';
import { atomicWriteText } from '../../infrastructure/fs/atomic-write.js';
import { createNodeConfigDiscoverer } from '../../infrastructure/fs/node-config-discoverer.js';
import { createNodeFileSystem } from '../../infrastructure/fs/node-file-system.js';
import { createPixelmatchDiffer } from '../../infrastructure/image/pixelmatch-differ.js';
import { createNodeProcessRunner } from '../../infrastructure/process/node-process-runner.js';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { parseMkdocsConfig } from '../../use-cases/config/parse-mkdocs.js';
import type { TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';
import { resolveProjectDir } from '../../use-cases/discover-config/resolve-project-dir.js';
import { explainConversion } from '../../use-cases/explain-conversion/explain.js';
import { runAstroCheck } from '../../use-cases/validate-output/run-astro-check.js';
import { compareSites } from '../../use-cases/visual-diff/compare.js';
import { serializeVisualDiffReport } from '../../use-cases/visual-diff/serialize-report.js';
import { convertSiteFromDisk } from '../api/convert-site.js';
import { formatReport } from './format-report.js';
import { parseArgs } from './parse-args.js';

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export interface CliOverrides {
  readonly processRunner?: ProcessRunner;
  readonly browserAutomator?: BrowserAutomator;
  readonly imageDiffer?: ImageDiffer;
}

const VERSION = '0.1.0';

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

export async function runCli(
  argv: ReadonlyArray<string>,
  io: CliIo,
  overrides: CliOverrides = {},
): Promise<number> {
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
    // The equivalent command is rendered inside the wizard via prompter.note,
    // so the user sees it framed with the rest of the wizard output instead of
    // mixed with the diagnostic report.
    return runConvert(wizard.command, io, overrides);
  }

  const command = parseArgs(argv);

  switch (command.kind) {
    case 'help':
      io.stdout(HELP_TEXT);
      return 0;
    case 'version':
      io.stdout(VERSION);
      return 0;
    case 'error':
      io.stderr(`error: ${command.message}`);
      io.stderr('');
      io.stderr('run with --help for usage');
      return 2;
    case 'convert':
      return runConvert(command, io, overrides);
    case 'explain':
      return runExplain(command.projectDir, io);
    case 'compare':
      return runCompare(command, io, overrides);
  }
}

// Reverse-index of registered rule IDs by their `relatedFeatureId`. Built
// once at module load so `--explain` can list every diagnostic that ties
// back to a given mapping row in O(1) per row.
const relatedRuleIdsByFeature: ReadonlyMap<string, ReadonlyArray<string>> = (() => {
  const map = new Map<string, string[]>();
  for (const entry of getAllRegisteredRuleIds()) {
    if (entry.relatedFeatureId === undefined) continue;
    const list = map.get(entry.relatedFeatureId) ?? [];
    list.push(entry.id);
    map.set(entry.relatedFeatureId, list);
  }
  return map;
})();

async function runExplain(projectDir: string, io: CliIo): Promise<number> {
  const yaml = createJsYamlDecoder();
  // Resolve the effective project directory the same way `convertSiteFromDisk`
  // does: try `<dir>/mkdocs.yml` first, fall back to bounded discovery so
  // `--explain` against a wrapper directory is just as forgiving.
  const fs = createNodeFileSystem();
  const discoverer = createNodeConfigDiscoverer();
  const resolved = await resolveProjectDir(projectDir, fs, discoverer);
  if (!resolved.ok) {
    if (resolved.error.kind === 'ambiguous') {
      io.stderr(`error: multiple mkdocs.yml found under ${resolved.error.searchedDir}:`);
      for (const c of resolved.error.candidates) {
        io.stderr(`  - ${c}`);
      }
      io.stderr(`Re-run --explain pointing at the intended subdirectory directly.`);
      return 1;
    }
    io.stderr(`error: mkdocs.yml not found under ${projectDir}.`);
    return 1;
  }
  const effectiveDir = resolved.value.projectDir;
  if (resolved.value.autoDiscovery !== null) {
    io.stderr(
      `note: auto-discovered ${resolved.value.autoDiscovery.discoveredRelPath} (no mkdocs.yml at ${projectDir}).`,
    );
  }
  let configText: string;
  try {
    configText = await readFile(join(effectiveDir, 'mkdocs.yml'), 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`error: could not read mkdocs.yml: ${message}`);
    return 1;
  }
  const decoded = yaml.decode(configText);
  if (!decoded.ok) {
    io.stderr(`error: yaml-decode-failed: ${decoded.error.message}`);
    return 1;
  }
  const config = parseMkdocsConfig(decoded.value);
  if (!config.ok) {
    io.stderr(`error: config-invalid: ${config.error.message}`);
    return 1;
  }
  const rows = explainConversion(config.value);
  io.stdout(`Conversion plan for ${effectiveDir} — ${rows.length} rows will fire:`);
  io.stdout('');
  for (const row of rows) {
    const depth = getTranslationDepth(row);
    const ruleIds = relatedRuleIdsByFeature.get(row.featureId);
    const ruleSummary =
      ruleIds === undefined || ruleIds.length === 0 ? '' : ` · diagnostics: ${ruleIds.join(', ')}`;
    io.stdout(
      `[${row.featureId}] (${row.risk} risk · ${row.conversionType} · depth: ${depth} · .${row.fileExt})${ruleSummary}`,
    );
    io.stdout(`  in : ${row.materialInput}`);
    io.stdout(`  out: ${row.starlightOutput}`);
    io.stdout('');
  }
  // Group summary by translation depth so the user sees at a glance how many
  // rows are full-fidelity vs lossy vs manual. Helps set expectations before
  // a long build.
  const counts = countDepths(rows);
  io.stdout(
    `Summary by depth: ` +
      `full=${String(counts.full)}, ` +
      `recommend-dep=${String(counts['recommend-dep'])}, ` +
      `passthrough=${String(counts.passthrough)}, ` +
      `lossy-named=${String(counts['lossy-named'])}, ` +
      `manual=${String(counts.manual)}`,
  );
  if (counts['lossy-named'] > 0 || counts.manual > 0) {
    io.stdout(
      'Note: `lossy-named` and `manual` rows surface diagnostics in MIGRATION_NOTES.md after conversion.',
    );
  }
  return 0;
}

function countDepths(rows: ReadonlyArray<MappingRow>): Record<TranslationDepth, number> {
  const out: Record<TranslationDepth, number> = {
    full: 0,
    'lossy-named': 0,
    passthrough: 0,
    'recommend-dep': 0,
    manual: 0,
  };
  for (const row of rows) {
    out[getTranslationDepth(row)] += 1;
  }
  return out;
}

interface ConvertCommand {
  readonly projectDir: string;
  readonly outputDir: string;
  readonly dryRun: boolean;
  readonly snippetBasePaths: ReadonlyArray<string> | null;
  readonly check: boolean;
  readonly checkTimeoutMs: number | null;
  readonly force: boolean;
  // wizard surface — Commit A (easy parametrizations)
  readonly linksValidator: boolean | null;
  readonly tabs: 'mdx' | 'html' | null;
  readonly sidebarTopics: boolean | null;
  readonly rss: boolean | null;
  readonly palette: 'translate' | 'skip' | 'custom' | null;
  readonly configFormat: 'mjs' | 'ts' | null;
  readonly packageName: string | null;
  readonly logoReplacesTitle: boolean;
  readonly mikeVersions: ReadonlyArray<string>;
  // wizard surface — Commit B (deferred)
  readonly cards: 'mdx' | 'html' | 'skip' | null;
  readonly mdxMode: 'auto' | 'always' | 'never' | null;
  readonly keepExplicitHeadingIds: boolean;
  readonly noSmartSymbols: boolean;
  readonly noEmojiShortcodes: boolean;
  readonly noInlineMarks: boolean;
  readonly noAutoAppend: boolean;
  readonly snippetMaxDepth: number | null;
  readonly snippetDedentSubsections: boolean;
  readonly expressiveCodeTheme: string | null;
  readonly admonitionMapPath: string | null;
  readonly extraAssets: ReadonlyArray<string>;
  readonly locales: ReadonlyArray<string>;
  readonly suppressRules: ReadonlyArray<string>;
}

async function runConvert(
  command: ConvertCommand,
  io: CliIo,
  overrides: CliOverrides,
): Promise<number> {
  if (command.dryRun) {
    io.stderr('--dry-run is not yet supported in this build');
    return 1;
  }
  const input = {
    projectDir: command.projectDir,
    outputDir: command.outputDir,
    ...(command.force ? { force: true } : {}),
    ...(command.snippetBasePaths !== null ? { snippetBasePaths: command.snippetBasePaths } : {}),
    ...(command.linksValidator !== null ? { linksValidator: command.linksValidator } : {}),
    ...(command.tabs !== null ? { tabs: command.tabs } : {}),
    ...(command.rss !== null ? { rss: command.rss } : {}),
    ...(command.palette !== null ? { palette: command.palette } : {}),
    ...(command.configFormat !== null ? { configFormat: command.configFormat } : {}),
    ...(command.packageName !== null ? { packageName: command.packageName } : {}),
    ...(command.logoReplacesTitle ? { logoReplacesTitle: true } : {}),
    ...(command.mikeVersions.length > 0 ? { mikeVersions: command.mikeVersions } : {}),
    // deferred (still passed so the diagnostic fires)
    ...(command.cards !== null ? { cards: command.cards } : {}),
    ...(command.mdxMode !== null ? { mdxMode: command.mdxMode } : {}),
    ...(command.keepExplicitHeadingIds ? { keepExplicitHeadingIds: true } : {}),
    ...(command.noSmartSymbols ? { noSmartSymbols: true } : {}),
    ...(command.noEmojiShortcodes ? { noEmojiShortcodes: true } : {}),
    ...(command.noInlineMarks ? { noInlineMarks: true } : {}),
    ...(command.noAutoAppend ? { noAutoAppend: true } : {}),
    ...(command.snippetMaxDepth !== null ? { snippetMaxDepth: command.snippetMaxDepth } : {}),
    ...(command.snippetDedentSubsections ? { snippetDedentSubsections: true } : {}),
    ...(command.expressiveCodeTheme !== null
      ? { expressiveCodeTheme: command.expressiveCodeTheme }
      : {}),
    ...(command.admonitionMapPath !== null ? { admonitionMapPath: command.admonitionMapPath } : {}),
    ...(command.extraAssets.length > 0 ? { extraAssets: command.extraAssets } : {}),
    ...(command.locales.length > 0 ? { locales: command.locales } : {}),
    ...(command.suppressRules.length > 0 ? { suppressRules: command.suppressRules } : {}),
    ...(command.sidebarTopics !== null ? { sidebarTopics: command.sidebarTopics } : {}),
  };
  const result = await convertSiteFromDisk(input);
  if (!result.ok) {
    io.stderr(`error: ${result.error.code}: ${result.error.message}`);
    return 1;
  }
  const conversionDiagnostics = result.value.diagnostics;
  const checkDiagnostics = command.check ? await runCheckPass(command, overrides) : [];
  const allDiagnostics = [...conversionDiagnostics, ...checkDiagnostics];
  io.stdout(formatReport(allDiagnostics));
  // CI-meaningful exit code: any error-severity diagnostic — whether emitted
  // by the converter (e.g. output-syntax-error after MDX validation) or by
  // astro check — means the generated project will not build. A clean exit 0
  // here would silently ship broken output to consumers.
  return allDiagnostics.some((d) => d.diagnostic.severity === 'error') ? 1 : 0;
}

interface CompareCommand {
  readonly baselineUrl: string;
  readonly convertedUrl: string;
  readonly paths: ReadonlyArray<string>;
  readonly threshold: number;
  readonly reportPath: string | null;
}

async function runCompare(
  command: CompareCommand,
  io: CliIo,
  overrides: CliOverrides,
): Promise<number> {
  const browser = overrides.browserAutomator ?? createPlaywrightAutomator();
  const differ = overrides.imageDiffer ?? createPixelmatchDiffer();
  const pairs: DiffPair[] = command.paths.map((path) => ({
    path,
    baselineUrl: joinUrl(command.baselineUrl, path),
    convertedUrl: joinUrl(command.convertedUrl, path),
  }));
  const report = await compareSites({
    pairs,
    browser,
    differ,
    threshold: command.threshold,
  });
  const text = serializeVisualDiffReport(report);
  if (command.reportPath !== null) {
    const written = await atomicWriteText(command.reportPath, text);
    if (!written.ok) {
      io.stderr(`error: ${written.error}`);
      return 1;
    }
    io.stdout(`wrote ${command.reportPath}`);
  } else {
    io.stdout(text);
  }
  return report.summary.mismatched + report.summary.captureFailed + report.summary.diffFailed > 0
    ? 1
    : 0;
}

function joinUrl(base: string, path: string): string {
  const baseTrimmed = base.replace(/\/+$/, '');
  const pathTrimmed = path.startsWith('/') ? path : `/${path}`;
  return `${baseTrimmed}${pathTrimmed}`;
}

async function runCheckPass(
  command: ConvertCommand,
  overrides: CliOverrides,
): Promise<ReadonlyArray<TaggedDiagnostic>> {
  const runner = overrides.processRunner ?? createNodeProcessRunner();
  const raw = await runAstroCheck(
    command.checkTimeoutMs === null
      ? { runner, outputDir: command.outputDir }
      : {
          runner,
          outputDir: command.outputDir,
          timeoutMs: command.checkTimeoutMs,
        },
  );
  return raw.map((diagnostic) => ({
    sourcePath: diagnostic.source,
    diagnostic,
  }));
}

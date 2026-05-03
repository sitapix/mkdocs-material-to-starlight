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
import { parseArgs } from './parse-args.js';
import { resolveInteractivity } from '../../infrastructure/env/tty-detection.js';
import { formatReport } from './format-report.js';
import { convertSiteFromDisk } from '../api/convert-site.js';
import { createJsYamlDecoder } from '../../infrastructure/yaml/js-yaml-decoder.js';
import { createNodeProcessRunner } from '../../infrastructure/process/node-process-runner.js';
import { parseMkdocsConfig } from '../../use-cases/config/parse-mkdocs.js';
import { explainConversion } from '../../use-cases/explain-conversion/explain.js';
import { runAstroCheck } from '../../use-cases/validate-output/run-astro-check.js';
import { compareSites } from '../../use-cases/visual-diff/compare.js';
import { serializeVisualDiffReport } from '../../use-cases/visual-diff/serialize-report.js';
import { createPlaywrightAutomator } from '../../infrastructure/browser/playwright-automator.js';
import { createPixelmatchDiffer } from '../../infrastructure/image/pixelmatch-differ.js';
import { writeFile } from 'node:fs/promises';
import type { ProcessRunner } from '../../domain/ports/process-runner.js';
import type { BrowserAutomator } from '../../domain/ports/browser-automator.js';
import type { ImageDiffer } from '../../domain/ports/image-differ.js';
import type { DiffPair } from '../../domain/visual-diff/page-diff.js';
import type { TaggedDiagnostic } from '../../use-cases/convert-site/convert.js';

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export interface CliOverrides {
  readonly processRunner?: ProcessRunner;
  readonly browserAutomator?: BrowserAutomator;
  readonly imageDiffer?: ImageDiffer;
}

const VERSION = '0.0.0';

const HELP_TEXT = `mkdocs-to-starlight — convert a MkDocs Material site to Astro Starlight

Usage:
  mkdocs-to-starlight <project-dir> <output-dir> [options]
  mkdocs-to-starlight --help
  mkdocs-to-starlight --version

Options:
  --snippet-base-path <path>   Resolve PyMdown snippets against this directory.
                               Repeatable; the first match wins.
  --dry-run                    Run the conversion in memory without writing files.
  --check                      Run \`astro check\` against the converted site
                               and report build-blocking errors.
  --check-timeout <ms>         Override the astro-check timeout (default: 5min).
  -h, --help                   Show this help.
  --version                    Print the version.

Subcommands:
  compare <baseline-url> <converted-url> [--pages a,b,c] [--threshold 0.01] [--report file.md]
                               Visually diff the rendered pages between the
                               baseline (MkDocs) and converted (Starlight)
                               sites. Requires Playwright + pixelmatch
                               (\`npm install playwright pixelmatch pngjs\`).
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
    io.stdout(
      `Equivalent command: mkdocs-to-starlight ${wizard.equivalentFlags.join(' ')}`,
    );
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

async function runExplain(projectDir: string, io: CliIo): Promise<number> {
  const yaml = createJsYamlDecoder();
  let configText: string;
  try {
    configText = await readFile(join(projectDir, 'mkdocs.yml'), 'utf8');
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
  io.stdout(`Conversion plan for ${projectDir} — ${rows.length} rows will fire:`);
  io.stdout('');
  for (const row of rows) {
    io.stdout(`[${row.featureId}] (${row.risk}, ${row.conversionType}, .${row.fileExt})`);
    io.stdout(`  in : ${row.materialInput}`);
    io.stdout(`  out: ${row.starlightOutput}`);
    io.stdout('');
  }
  return 0;
}

interface ConvertCommand {
  readonly projectDir: string;
  readonly outputDir: string;
  readonly dryRun: boolean;
  readonly snippetBasePaths: ReadonlyArray<string> | null;
  readonly check: boolean;
  readonly checkTimeoutMs: number | null;
  // wizard surface — Commit A (easy parametrizations)
  readonly linksValidator: boolean | null;
  readonly tabs: 'mdx' | 'html' | null;
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
    ...(command.expressiveCodeTheme !== null ? { expressiveCodeTheme: command.expressiveCodeTheme } : {}),
    ...(command.admonitionMapPath !== null ? { admonitionMapPath: command.admonitionMapPath } : {}),
    ...(command.extraAssets.length > 0 ? { extraAssets: command.extraAssets } : {}),
    ...(command.locales.length > 0 ? { locales: command.locales } : {}),
    ...(command.suppressRules.length > 0 ? { suppressRules: command.suppressRules } : {}),
  };
  const result = await convertSiteFromDisk(input);
  if (!result.ok) {
    io.stderr(`error: ${result.error.code}: ${result.error.message}`);
    return 1;
  }
  const conversionDiagnostics = result.value.diagnostics;
  const checkDiagnostics = command.check
    ? await runCheckPass(command, overrides)
    : [];
  io.stdout(formatReport([...conversionDiagnostics, ...checkDiagnostics]));
  return checkDiagnostics.some((d) => d.diagnostic.severity === 'error') ? 1 : 0;
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
    try {
      await writeFile(command.reportPath, text, 'utf8');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      io.stderr(`error: failed to write ${command.reportPath}: ${message}`);
      return 1;
    }
    io.stdout(`wrote ${command.reportPath}`);
  } else {
    io.stdout(text);
  }
  return report.summary.mismatched +
    report.summary.captureFailed +
    report.summary.diffFailed >
    0
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

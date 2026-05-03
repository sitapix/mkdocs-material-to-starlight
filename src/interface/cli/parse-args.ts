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
  let parsed: ReturnType<typeof nodeParseArgs>;
  try {
    parsed = nodeParseArgs({
      args: [...argv],
      options: CONVERT_OPTIONS,
      allowPositionals: true,
      strict: true,
    } as Parameters<typeof nodeParseArgs>[0]);
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
    snippetBasePathsRaw === undefined || (Array.isArray(snippetBasePathsRaw) && snippetBasePathsRaw.length === 0)
      ? null
      : (Array.isArray(snippetBasePathsRaw) ? (snippetBasePathsRaw as ReadonlyArray<string>) : null);

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
  let parsed: ReturnType<typeof nodeParseArgs>;
  try {
    parsed = nodeParseArgs({
      args: [...argv],
      options: COMPARE_OPTIONS,
      allowPositionals: true,
      strict: true,
    } as Parameters<typeof nodeParseArgs>[0]);
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
  const pagesRaw = parsed.values.pages;
  if (pagesRaw !== undefined && typeof pagesRaw === 'string') {
    for (const p of pagesRaw.split(',')) {
      const trimmed = p.trim();
      if (trimmed.length > 0) paths.push(trimmed);
    }
  }
  if (paths.length === 0) paths.push('/');

  const reportRaw = parsed.values.report;
  const reportPath = reportRaw !== undefined && typeof reportRaw === 'string' ? reportRaw : null;

  return {
    kind: 'compare',
    baselineUrl: positionals[0] ?? '',
    convertedUrl: positionals[1] ?? '',
    paths,
    threshold,
    reportPath,
  };
}

function extractParseError(cause: unknown): string {
  if (cause instanceof Error) {
    // node:util parseArgs throws ERR_PARSE_ARGS_UNKNOWN_OPTION etc.
    return cause.message.replace(/^.*?: /, '').replace(/\.\s*$/, '');
  }
  return String(cause);
}

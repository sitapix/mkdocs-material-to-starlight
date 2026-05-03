/**
 * Pure CLI argument parser. Takes the raw `argv` slice (without `node` and
 * the script name) and returns a typed `Command` describing what to do.
 *
 * Pure: no side effects, no `process` access, no console output. The CLI
 * `main.ts` calls this, then dispatches based on the returned variant.
 *
 * Supported invocations:
 *   --help, -h                          → help
 *   --version                           → version
 *   <project-dir> <output-dir> [opts]   → convert
 *
 * Options:
 *   --snippet-base-path <path>  (repeatable) — enables snippet expansion
 *   --dry-run                                — runs conversion in memory only
 */

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

export function parseArgs(argv: ReadonlyArray<string>): Command {
  if (argv.length === 0) {
    return { kind: 'error', message: 'missing project directory' };
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    return { kind: 'help' };
  }
  if (argv.includes('--version')) {
    return { kind: 'version' };
  }

  if (argv[0] === 'compare') {
    return parseCompareArgs(argv.slice(1));
  }

  const positionals: string[] = [];
  const snippetBasePaths: string[] = [];
  let dryRun = false;
  let explain = false;
  let check = false;
  let checkTimeoutMs: number | null = null;
  let i = 0;
  while (i < argv.length) {
    const token = argv[i] ?? '';
    if (token === '--snippet-base-path') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { kind: 'error', message: '--snippet-base-path requires a value' };
      }
      snippetBasePaths.push(value);
      i += 2;
      continue;
    }
    if (token === '--dry-run') {
      dryRun = true;
      i += 1;
      continue;
    }
    if (token === '--explain') {
      explain = true;
      i += 1;
      continue;
    }
    if (token === '--check') {
      check = true;
      i += 1;
      continue;
    }
    if (token === '--check-timeout') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { kind: 'error', message: '--check-timeout requires a value' };
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return {
          kind: 'error',
          message: `--check-timeout must be a positive number of milliseconds (got "${value}")`,
        };
      }
      checkTimeoutMs = parsed;
      i += 2;
      continue;
    }
    if (token.startsWith('--')) {
      return { kind: 'error', message: `unknown option ${token}` };
    }
    positionals.push(token);
    i += 1;
  }

  if (positionals.length < 1) {
    return { kind: 'error', message: 'missing project directory' };
  }

  if (explain) {
    return { kind: 'explain', projectDir: positionals[0] ?? '' };
  }

  if (positionals.length < 2) {
    return { kind: 'error', message: 'missing output directory' };
  }

  return {
    kind: 'convert',
    projectDir: positionals[0] ?? '',
    outputDir: positionals[1] ?? '',
    snippetBasePaths: snippetBasePaths.length === 0 ? null : snippetBasePaths,
    dryRun,
    check,
    checkTimeoutMs,
  };
}

function parseCompareArgs(argv: ReadonlyArray<string>): Command {
  const positionals: string[] = [];
  const paths: string[] = [];
  let threshold = 0.01;
  let reportPath: string | null = null;
  let i = 0;
  while (i < argv.length) {
    const token = argv[i] ?? '';
    if (token === '--pages') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { kind: 'error', message: '--pages requires a value' };
      }
      for (const p of value.split(',')) {
        const trimmed = p.trim();
        if (trimmed.length > 0) paths.push(trimmed);
      }
      i += 2;
      continue;
    }
    if (token === '--threshold') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { kind: 'error', message: '--threshold requires a value' };
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        return {
          kind: 'error',
          message: `--threshold must be a number between 0 and 1 (got "${value}")`,
        };
      }
      threshold = parsed;
      i += 2;
      continue;
    }
    if (token === '--report') {
      const value = argv[i + 1];
      if (value === undefined) {
        return { kind: 'error', message: '--report requires a path' };
      }
      reportPath = value;
      i += 2;
      continue;
    }
    if (token.startsWith('--')) {
      return { kind: 'error', message: `unknown option ${token}` };
    }
    positionals.push(token);
    i += 1;
  }
  if (positionals.length < 2) {
    return {
      kind: 'error',
      message: 'compare requires <baseline-url> and <converted-url>',
    };
  }
  if (paths.length === 0) {
    paths.push('/');
  }
  return {
    kind: 'compare',
    baselineUrl: positionals[0] ?? '',
    convertedUrl: positionals[1] ?? '',
    paths,
    threshold,
    reportPath,
  };
}

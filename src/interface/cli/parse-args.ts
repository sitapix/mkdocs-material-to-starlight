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

const COMPARE_OPTIONS = {
  pages: { type: 'string' },
  threshold: { type: 'string' },
  report: { type: 'string' },
} as const;

export function parseArgs(argv: ReadonlyArray<string>): Command {
  if (argv.length === 0) {
    return {
      kind: 'error',
      message:
        'missing <project-dir> argument (path to your MkDocs site root, e.g. `mkdocs-material-to-starlight ./docs ./out`). Run with --help for full usage.',
    };
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
      return {
        kind: 'error',
        message:
          'missing <project-dir> argument (path to your MkDocs site root, e.g. `mkdocs-material-to-starlight ./docs ./out`). Run with --help for full usage.',
      };
    }
    return { kind: 'explain', projectDir: positionals[0] ?? '' };
  }

  if (positionals.length < 1) {
    return {
      kind: 'error',
      message:
        'missing <project-dir> argument (path to your MkDocs site root, e.g. `mkdocs-material-to-starlight ./docs ./out`). Run with --help for full usage.',
    };
  }
  const hasDirOverride = (parsed.values.dir as string | undefined) !== undefined;
  if (positionals.length < 2 && !hasDirOverride) {
    return {
      kind: 'error',
      message:
        'missing <output-dir> argument (where to write the converted Starlight project, e.g. `mkdocs-material-to-starlight ./docs ./out`). Run with --help for full usage.',
    };
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
    snippetBasePathsRaw === undefined ||
    (Array.isArray(snippetBasePathsRaw) && snippetBasePathsRaw.length === 0)
      ? null
      : Array.isArray(snippetBasePathsRaw)
        ? (snippetBasePathsRaw as ReadonlyArray<string>)
        : null;

  if (parsed.values.check === true && parsed.values['no-check'] === true) {
    return { kind: 'error', message: '--check and --no-check are mutually exclusive' };
  }
  const check =
    parsed.values.check === true ? true : parsed.values['no-check'] === true ? false : false;

  const dirOverride = (parsed.values.dir as string | undefined) ?? null;

  if (dirOverride !== null && positionals.length >= 2) {
    return {
      kind: 'error',
      message: '--dir and a positional output directory are mutually exclusive',
    };
  }

  let snippetMaxDepth: number | null = null;
  const sm = parsed.values['snippet-max-depth'];
  if (sm !== undefined) {
    const n = Number(sm);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      return {
        kind: 'error',
        message: `--snippet-max-depth must be a positive integer (got "${sm}")`,
      };
    }
    snippetMaxDepth = n;
  }

  const wizardResult = resolveWizardFlags(parsed.values);
  if (wizardResult.kind === 'error') return wizardResult;

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
    color: parsed.values.color === true ? true : parsed.values['no-color'] === true ? false : null,
    packageManager: wizardResult.packageManager,
    tabs: wizardResult.tabs,
    sidebarTopics: resolveBoolPair(
      parsed.values['sidebar-topics'] as boolean | undefined,
      parsed.values['no-sidebar-topics'] as boolean | undefined,
    ),
    rss: resolveBoolPair(
      parsed.values.rss as boolean | undefined,
      parsed.values['no-rss'] as boolean | undefined,
    ),
    mikeVersions: (parsed.values['mike-versions'] as string[] | undefined) ?? [],
    palette: wizardResult.palette,
    extraAssets: (parsed.values['extra-asset'] as string[] | undefined) ?? [],
    locales: (parsed.values.locale as string[] | undefined) ?? [],
    snippetMaxDepth,
    snippetDedentSubsections: parsed.values['snippet-dedent-subsections'] === true,
    linksValidator: resolveBoolPair(
      parsed.values['links-validator'] as boolean | undefined,
      parsed.values['no-links-validator'] as boolean | undefined,
    ),
    expressiveCodeTheme: (parsed.values['expressive-code-theme'] as string | undefined) ?? null,
    cards: wizardResult.cards,
    mdxMode: wizardResult.mdxMode,
    logoReplacesTitle: parsed.values['logo-replaces-title'] === true,
    admonitionMapPath: (parsed.values['admonition-map'] as string | undefined) ?? null,
    keepExplicitHeadingIds: parsed.values['keep-explicit-heading-ids'] === true,
    noSmartSymbols: parsed.values['no-smart-symbols'] === true,
    noEmojiShortcodes: parsed.values['no-emoji-shortcodes'] === true,
    noInlineMarks: parsed.values['no-inline-marks'] === true,
    noAutoAppend: parsed.values['no-auto-append'] === true,
    suppressRules: (parsed.values.suppress as string[] | undefined) ?? [],
    configFormat: wizardResult.configFormat,
    packageName: (parsed.values['package-name'] as string | undefined) ?? null,
  };
}

type ParsedValues = ReturnType<typeof nodeParseArgs>['values'];

type WizardFlagsResult =
  | {
      kind: 'ok';
      packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
      tabs: 'mdx' | 'html' | null;
      palette: 'translate' | 'skip' | 'custom' | null;
      cards: 'mdx' | 'html' | 'skip' | null;
      mdxMode: 'auto' | 'always' | 'never' | null;
      configFormat: 'mjs' | 'ts' | null;
    }
  | { kind: 'error'; message: string };

function resolveWizardFlags(values: ParsedValues): WizardFlagsResult {
  const pmResult = parseEnum(
    values['package-manager'] as string | undefined,
    ['npm', 'pnpm', 'yarn', 'bun'] as const,
    '--package-manager',
  );
  if (!pmResult.ok) return { kind: 'error', message: pmResult.message };

  const tabsResult = parseEnum(
    values.tabs as string | undefined,
    ['mdx', 'html'] as const,
    '--tabs',
  );
  if (!tabsResult.ok) return { kind: 'error', message: tabsResult.message };

  const paletteResult = parseEnum(
    values.palette as string | undefined,
    ['translate', 'skip', 'custom'] as const,
    '--palette',
  );
  if (!paletteResult.ok) return { kind: 'error', message: paletteResult.message };

  const cardsResult = parseEnum(
    values.cards as string | undefined,
    ['mdx', 'html', 'skip'] as const,
    '--cards',
  );
  if (!cardsResult.ok) return { kind: 'error', message: cardsResult.message };

  const mdxModeResult = parseEnum(
    values['mdx-mode'] as string | undefined,
    ['auto', 'always', 'never'] as const,
    '--mdx-mode',
  );
  if (!mdxModeResult.ok) return { kind: 'error', message: mdxModeResult.message };

  const configFormatResult = parseEnum(
    values['config-format'] as string | undefined,
    ['mjs', 'ts'] as const,
    '--config-format',
  );
  if (!configFormatResult.ok) return { kind: 'error', message: configFormatResult.message };

  return {
    kind: 'ok',
    packageManager: pmResult.value,
    tabs: tabsResult.value,
    palette: paletteResult.value,
    cards: cardsResult.value,
    mdxMode: mdxModeResult.value,
    configFormat: configFormatResult.value,
  };
}

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

function resolveBoolPair(on: boolean | undefined, off: boolean | undefined): boolean | null {
  if (on === true) return true;
  if (off === true) return false;
  return null;
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
      message:
        'compare requires <baseline-url> <converted-url> (e.g. `mkdocs-material-to-starlight compare https://old-docs.example.com https://new-docs.example.com`). Run with --help for full usage.',
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

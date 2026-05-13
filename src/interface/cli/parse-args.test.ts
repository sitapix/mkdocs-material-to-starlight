import { describe, expect, it } from 'vitest';
import { parseArgs } from './parse-args.js';

describe('parseArgs', () => {
  it('parses --help', () => {
    const result = parseArgs(['--help']);
    expect(result.kind).toBe('help');
  });

  it('parses -h', () => {
    expect(parseArgs(['-h']).kind).toBe('help');
  });

  it('parses --version', () => {
    expect(parseArgs(['--version']).kind).toBe('version');
  });

  it('parses convert with project and output positional args', () => {
    const result = parseArgs(['./project', './output']);
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
      verbose: false,
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
  });

  it('reports an error when project is missing', () => {
    const result = parseArgs([]);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toMatch(/project/i);
    }
  });

  it('reports an error when output is missing', () => {
    const result = parseArgs(['./project']);
    expect(result.kind).toBe('error');
  });

  it('parses --snippet-base-path option, repeatable', () => {
    const result = parseArgs([
      './project',
      './output',
      '--snippet-base-path',
      'docs',
      '--snippet-base-path',
      'overrides',
    ]);
    expect(result.kind).toBe('convert');
    if (result.kind === 'convert') {
      expect(result.snippetBasePaths).toEqual(['docs', 'overrides']);
    }
  });

  it('parses --dry-run flag', () => {
    const result = parseArgs(['./project', './output', '--dry-run']);
    expect(result.kind).toBe('convert');
    if (result.kind === 'convert') {
      expect(result.dryRun).toBe(true);
    }
  });

  it('reports an error for an unknown flag', () => {
    const result = parseArgs(['./project', './output', '--bogus']);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.message).toMatch(/--bogus/);
    }
  });

  it('rejects an option with a missing value', () => {
    const result = parseArgs(['./project', './output', '--snippet-base-path']);
    expect(result.kind).toBe('error');
  });

  it('parses --check flag (default: false)', () => {
    const noCheck = parseArgs(['./project', './output']);
    expect(noCheck.kind).toBe('convert');
    if (noCheck.kind === 'convert') {
      expect(noCheck.check).toBe(false);
    }
    const withCheck = parseArgs(['./project', './output', '--check']);
    expect(withCheck.kind).toBe('convert');
    if (withCheck.kind === 'convert') {
      expect(withCheck.check).toBe(true);
    }
  });

  it('parses --check-timeout <ms>', () => {
    const result = parseArgs(['./project', './output', '--check', '--check-timeout', '60000']);
    expect(result.kind).toBe('convert');
    if (result.kind === 'convert') {
      expect(result.checkTimeoutMs).toBe(60000);
    }
  });

  it('rejects a non-numeric --check-timeout value', () => {
    const result = parseArgs(['./project', './output', '--check-timeout', 'soon']);
    expect(result.kind).toBe('error');
  });

  it('parses --explain as a standalone command requiring only project dir', () => {
    const result = parseArgs(['./project', '--explain']);
    expect(result.kind).toBe('explain');
    if (result.kind === 'explain') {
      expect(result.projectDir).toBe('./project');
    }
  });

  it('parses compare with baseline and converted URLs', () => {
    const result = parseArgs(['compare', 'http://localhost:8000', 'http://localhost:4321']);
    expect(result.kind).toBe('compare');
    if (result.kind === 'compare') {
      expect(result.baselineUrl).toBe('http://localhost:8000');
      expect(result.convertedUrl).toBe('http://localhost:4321');
      expect(result.paths).toEqual(['/']);
      expect(result.threshold).toBe(0.01);
    }
  });

  it('parses compare --pages as a comma-separated list', () => {
    const result = parseArgs(['compare', 'http://b', 'http://c', '--pages', '/,api/auth,about']);
    expect(result.kind).toBe('compare');
    if (result.kind === 'compare') {
      expect(result.paths).toEqual(['/', 'api/auth', 'about']);
    }
  });

  it('parses compare --threshold and --report', () => {
    const result = parseArgs([
      'compare',
      'http://b',
      'http://c',
      '--threshold',
      '0.05',
      '--report',
      'visual.md',
    ]);
    expect(result.kind).toBe('compare');
    if (result.kind === 'compare') {
      expect(result.threshold).toBe(0.05);
      expect(result.reportPath).toBe('visual.md');
    }
  });

  it('rejects compare with missing URLs', () => {
    expect(parseArgs(['compare']).kind).toBe('error');
    expect(parseArgs(['compare', 'http://b']).kind).toBe('error');
  });

  it('rejects compare --threshold outside [0, 1]', () => {
    expect(parseArgs(['compare', 'http://b', 'http://c', '--threshold', '1.5']).kind).toBe('error');
    expect(parseArgs(['compare', 'http://b', 'http://c', '--threshold', 'soon']).kind).toBe(
      'error',
    );
  });

  it('accepts --explain BEFORE the project dir too', () => {
    const result = parseArgs(['--explain', './project']);
    expect(result.kind).toBe('explain');
  });

  it('accepts -y as a no-op short alias to be used by later wizard work', () => {
    // -y currently sets no field but must not cause an "unknown option" error.
    const result = parseArgs(['./project', './output', '-y']);
    expect(result.kind).toBe('convert');
  });
});

describe('parseArgs — wizard flag surface', () => {
  it('parses --no-check (negation)', () => {
    const r = parseArgs(['./p', './o', '--no-check']);
    expect(r.kind).toBe('convert');
    if (r.kind === 'convert') expect(r.check).toBe(false);
  });

  it('parses --tabs=mdx and --tabs=html', () => {
    const a = parseArgs(['./p', './o', '--tabs=mdx']);
    expect(a.kind).toBe('convert');
    if (a.kind === 'convert') expect(a.tabs).toBe('mdx');
    const b = parseArgs(['./p', './o', '--tabs=html']);
    if (b.kind === 'convert') expect(b.tabs).toBe('html');
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

  it('rejects --dir + positional output directory together (mutually exclusive)', () => {
    const r = parseArgs(['./project', './output', '--dir', './alt']);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toMatch(/--dir.*mutually exclusive/i);
  });

  it('accepts --dir without a second positional', () => {
    const r = parseArgs(['./project', '--dir', './output']);
    expect(r.kind).toBe('convert');
    if (r.kind === 'convert') expect(r.outputDir).toBe('./output');
  });
});

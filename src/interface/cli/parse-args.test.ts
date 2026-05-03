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
    const result = parseArgs([
      './project',
      './output',
      '--check',
      '--check-timeout',
      '60000',
    ]);
    expect(result.kind).toBe('convert');
    if (result.kind === 'convert') {
      expect(result.checkTimeoutMs).toBe(60000);
    }
  });

  it('rejects a non-numeric --check-timeout value', () => {
    const result = parseArgs([
      './project',
      './output',
      '--check-timeout',
      'soon',
    ]);
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
    const result = parseArgs([
      'compare',
      'http://localhost:8000',
      'http://localhost:4321',
    ]);
    expect(result.kind).toBe('compare');
    if (result.kind === 'compare') {
      expect(result.baselineUrl).toBe('http://localhost:8000');
      expect(result.convertedUrl).toBe('http://localhost:4321');
      expect(result.paths).toEqual(['/']);
      expect(result.threshold).toBe(0.01);
    }
  });

  it('parses compare --pages as a comma-separated list', () => {
    const result = parseArgs([
      'compare',
      'http://b',
      'http://c',
      '--pages',
      '/,api/auth,about',
    ]);
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
    expect(
      parseArgs(['compare', 'http://b', 'http://c', '--threshold', '1.5']).kind,
    ).toBe('error');
    expect(
      parseArgs(['compare', 'http://b', 'http://c', '--threshold', 'soon']).kind,
    ).toBe('error');
  });

  it('accepts --explain BEFORE the project dir too', () => {
    const result = parseArgs(['--explain', './project']);
    expect(result.kind).toBe('explain');
  });
});

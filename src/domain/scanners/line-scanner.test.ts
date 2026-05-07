import { describe, expect, it } from 'vitest';
import { createDiagnostic, type Diagnostic } from '../diagnostics/diagnostic.js';
import { runLineScanners, type LineScanner } from './line-scanner.js';

const TODO_LINE = /^\s*TODO\b/;
const FIXME_LINE = /^\s*FIXME\b/;

const todoScanner: LineScanner = {
  ruleId: 'todo-detected',
  scan: (line, lineNumber) => {
    if (!TODO_LINE.test(line)) return null;
    return createDiagnostic({
      severity: 'info',
      ruleId: 'todo-detected',
      source: 'test/todo',
      message: `TODO at line ${String(lineNumber)}`,
      place: { line: lineNumber, column: 1 },
    });
  },
};

const fixmeScanner: LineScanner = {
  ruleId: 'fixme-detected',
  scan: (line, lineNumber) => {
    if (!FIXME_LINE.test(line)) return null;
    return createDiagnostic({
      severity: 'info',
      ruleId: 'fixme-detected',
      source: 'test/fixme',
      message: `FIXME at line ${String(lineNumber)}`,
      place: { line: lineNumber, column: 1 },
    });
  },
};

function ruleIds(diagnostics: ReadonlyArray<Diagnostic>): ReadonlyArray<string> {
  return diagnostics.map((d) => d.ruleId);
}

describe('runLineScanners', () => {
  it('returns no diagnostics when no scanners match any line', () => {
    const out = runLineScanners('a paragraph\nanother line\n', [todoScanner]);
    expect(out).toEqual([]);
  });

  it('dispatches each non-fenced line to every scanner in the registry', () => {
    const source = 'TODO write this\nFIXME broken\n';
    const out = runLineScanners(source, [todoScanner, fixmeScanner]);
    expect(ruleIds(out)).toEqual(['todo-detected', 'fixme-detected']);
  });

  it('records 1-based line numbers matching the source', () => {
    const source = 'first\nTODO second\nthird\n';
    const out = runLineScanners(source, [todoScanner]);
    expect(out).toHaveLength(1);
    expect(out[0]?.place?.line).toBe(2);
  });

  it('skips lines inside fenced code blocks (does not match scanner patterns)', () => {
    const source = ['```python', 'TODO inside fence is not a real TODO', '```', ''].join('\n');
    const out = runLineScanners(source, [todoScanner]);
    expect(out).toEqual([]);
  });

  it('matches lines after a fence closes', () => {
    const source = ['```', 'TODO inside fence', '```', 'TODO after fence', ''].join('\n');
    const out = runLineScanners(source, [todoScanner]);
    expect(out).toHaveLength(1);
    expect(out[0]?.place?.line).toBe(4);
  });

  it('reports diagnostics in source order, regardless of scanner registry order', () => {
    const source = 'FIXME first line\nTODO second line\n';
    const out = runLineScanners(source, [todoScanner, fixmeScanner]);
    expect(ruleIds(out)).toEqual(['fixme-detected', 'todo-detected']);
  });

  it('skips inline-code lines that contain backtick runs but are not fences', () => {
    // A line like `` ``` ` `` is inline code at the start, not a fence opener.
    // CommonMark §4.5: a backtick fence opener cannot contain backticks in its
    // info string. Verified via the project's existing `isFenceLine` logic.
    const source = '```snippet `{path="x"}`\nTODO this should match\n';
    const out = runLineScanners(source, [todoScanner]);
    // The first line is NOT a real fence opener (backticks in info string),
    // so the scanner should still match the second line.
    expect(out).toHaveLength(1);
    expect(out[0]?.place?.line).toBe(2);
  });

  it('accepts a scanner that returns an array of diagnostics for one line', () => {
    // Some scanners (e.g. macro-expression) emit multiple findings per line.
    // The Module accepts `Diagnostic | ReadonlyArray<Diagnostic> | null` so
    // those scanners fit without callers having to filter post-hoc.
    const TWO_DOLLARS_RE = /\$/g;
    const dollarScanner: LineScanner = {
      ruleId: 'dollar-found',
      scan: (line, lineNumber) => {
        const matches = [...line.matchAll(TWO_DOLLARS_RE)];
        if (matches.length === 0) return null;
        return matches.map((m) =>
          createDiagnostic({
            severity: 'info',
            ruleId: 'dollar-found',
            source: 'test/dollar',
            message: `$ at column ${String((m.index ?? 0) + 1)}`,
            place: { line: lineNumber, column: (m.index ?? 0) + 1 },
          }),
        );
      },
    };
    const out = runLineScanners('a $ b $ c\n', [dollarScanner]);
    expect(out).toHaveLength(2);
    expect(out[0]?.place?.column).toBe(3);
    expect(out[1]?.place?.column).toBe(7);
  });

  it('accepts a scanner that returns an empty array (treats it as a non-match)', () => {
    const noopScanner: LineScanner = {
      ruleId: 'never',
      scan: () => [],
    };
    expect(runLineScanners('any line\n', [noopScanner])).toEqual([]);
  });
});

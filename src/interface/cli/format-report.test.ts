import { describe, expect, it } from 'vitest';
import { formatReport } from './format-report.js';
import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';

describe('formatReport', () => {
  it('reports zero diagnostics with a success line', () => {
    const out = formatReport([]);
    expect(out).toContain('0 issues');
    expect(out).toMatch(/clean|success|ok/i);
  });

  it('formats a single warning with source path and line/column', () => {
    const out = formatReport([
      {
        sourcePath: 'index.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'broken-link',
          message: 'target not found',
          source: 'mkdocs-material-to-starlight',
          place: { line: 12, column: 4 },
        }),
      },
    ]);
    expect(out).toContain('index.md:12:4');
    expect(out).toContain('warning');
    expect(out).toContain('broken-link');
    expect(out).toContain('target not found');
  });

  it('formats diagnostics without a place using just the source path', () => {
    const out = formatReport([
      {
        sourcePath: 'a.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'r',
          message: 'm',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    expect(out).toContain('a.md');
    expect(out).not.toMatch(/a\.md:/);
  });

  it('strips terminal escape sequences from sourcePath, ruleId, and message (CWE-150)', () => {
    // A hostile mkdocs.yml site_name or third-party error message could embed
    // CSI/OSC sequences that hijack the user's terminal. The report must
    // never let those reach stdout.
    const out = formatReport([
      {
        sourcePath: '\x1b[31mhi\x1b[0m/file.md',
        diagnostic: createDiagnostic({
          severity: 'error',
          ruleId: 'r1',
          message: '\x1b[2J\x1b]0;pwned\x07legitimate text',
          source: 'mkdocs-material-to-starlight',
          place: { line: 1, column: 1 },
        }),
      },
    ]);
    expect(out).not.toContain('\x1b');
    expect(out).not.toContain('\x07');
    expect(out).toContain('hi/file.md:1:1');
    expect(out).toContain('legitimate text');
  });

  it('collapses multi-line diagnostic messages onto a single output line', () => {
    const out = formatReport([
      {
        sourcePath: 'x.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'r',
          message: 'first line\nsecond line\nthird',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    // Each diagnostic must be exactly one report line so grep / sort still work.
    const reportLine = out.split('\n').find((l) => l.startsWith('x.md'));
    expect(reportLine).toBeDefined();
    expect(reportLine).toContain('first line second line third');
  });

  it('summarizes counts by severity at the end', () => {
    const out = formatReport([
      {
        sourcePath: 'a',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'r1',
          message: 'm',
          source: 'mkdocs-material-to-starlight',
        }),
      },
      {
        sourcePath: 'b',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'r2',
          message: 'm',
          source: 'mkdocs-material-to-starlight',
        }),
      },
      {
        sourcePath: 'c',
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'r3',
          message: 'm',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    expect(out).toMatch(/2 warnings/);
    expect(out).toMatch(/1 info/);
  });
});

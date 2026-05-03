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
          source: 'mkdocs-to-starlight',
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
          source: 'mkdocs-to-starlight',
        }),
      },
    ]);
    expect(out).toContain('a.md');
    expect(out).not.toMatch(/a\.md:/);
  });

  it('summarizes counts by severity at the end', () => {
    const out = formatReport([
      {
        sourcePath: 'a',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'r1',
          message: 'm',
          source: 'mkdocs-to-starlight',
        }),
      },
      {
        sourcePath: 'b',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'r2',
          message: 'm',
          source: 'mkdocs-to-starlight',
        }),
      },
      {
        sourcePath: 'c',
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'r3',
          message: 'm',
          source: 'mkdocs-to-starlight',
        }),
      },
    ]);
    expect(out).toMatch(/2 warnings/);
    expect(out).toMatch(/1 info/);
  });
});

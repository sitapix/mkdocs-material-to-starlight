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

  it('shows all diagnostics when a ruleId has at most 5 occurrences', () => {
    // Below the collapse threshold, output is verbatim — every line shown.
    const diags = Array.from({ length: 5 }, (_, i) => ({
      sourcePath: `file${i}.md`,
      diagnostic: createDiagnostic({
        severity: 'warning' as const,
        ruleId: 'broken-link',
        message: `target ${i}`,
        source: 'mkdocs-material-to-starlight',
        place: { line: i + 1, column: 1 },
      }),
    }));
    const out = formatReport(diags);
    for (let i = 0; i < 5; i += 1) {
      expect(out).toContain(`file${i}.md:${i + 1}:1`);
    }
    expect(out).not.toMatch(/and \d+ more/);
  });

  it('collapses long runs of the same ruleId, showing first 3 and a "and N more" summary', () => {
    // Real regression: zbghost325/XRIML-WIKI emits 88 unknown-frontmatter
    // warnings — a wall of text that drowns useful diagnostics. Threshold = 5.
    const diags = Array.from({ length: 88 }, (_, i) => ({
      sourcePath: `page${i}.md`,
      diagnostic: createDiagnostic({
        severity: 'warning' as const,
        ruleId: 'unknown-frontmatter-field',
        message: `frontmatter field "tags" ...`,
        source: 'mkdocs-material-to-starlight',
        place: { line: 3, column: 1 },
      }),
    }));
    const out = formatReport(diags);
    // First 3 lines shown verbatim.
    expect(out).toContain('page0.md');
    expect(out).toContain('page1.md');
    expect(out).toContain('page2.md');
    // Lines 4-87 hidden behind the summary.
    expect(out).not.toContain('page50.md');
    expect(out).not.toContain('page87.md');
    expect(out).toMatch(/85 more.*unknown-frontmatter-field/i);
    // Summary line still reflects the FULL count.
    expect(out).toMatch(/88 warnings/);
  });

  it('groups separate ruleIds independently — collapsing only those over threshold', () => {
    const diags = [
      // 10 of ruleA — over threshold, will collapse.
      ...Array.from({ length: 10 }, (_, i) => ({
        sourcePath: `a${i}.md`,
        diagnostic: createDiagnostic({
          severity: 'warning' as const,
          ruleId: 'unknown-frontmatter-field',
          message: 'm',
          source: 'mkdocs-material-to-starlight',
        }),
      })),
      // 2 of ruleB — under threshold, both shown.
      ...Array.from({ length: 2 }, (_, i) => ({
        sourcePath: `b${i}.md`,
        diagnostic: createDiagnostic({
          severity: 'warning' as const,
          ruleId: 'broken-link',
          message: 'm',
          source: 'mkdocs-material-to-starlight',
        }),
      })),
    ];
    const out = formatReport(diags);
    expect(out).toContain('b0.md');
    expect(out).toContain('b1.md');
    expect(out).toMatch(/7 more.*unknown-frontmatter-field/i);
    expect(out).not.toMatch(/more.*broken-link/i);
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

import { describe, expect, it } from 'vitest';
import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';
import { formatReport } from './format-report.js';

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

  it('writes the ruleId, severity, and count once per group as a header line', () => {
    // The per-row severity column was removed because every row in a group
    // shares the same severity — repeating it on every line was pure noise.
    // The header now states ruleId + severity + count once per chunk.
    const out = formatReport([
      {
        sourcePath: 'a-very-long-path/with/many/segments/page.md',
        diagnostic: createDiagnostic({
          severity: 'error',
          ruleId: 'r',
          message: 'm',
          source: 'mkdocs-material-to-starlight',
          place: { line: 1, column: 1 },
        }),
      },
      {
        sourcePath: 'short.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'r2',
          message: 'm2',
          source: 'mkdocs-material-to-starlight',
        }),
      },
      {
        sourcePath: 'mid/page.md',
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'r3',
          message: 'm3',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    expect(out).toMatch(/^r\s+\(error,\s*1\)/m);
    expect(out).toMatch(/^r2\s+\(warning,\s*1\)/m);
    expect(out).toMatch(/^r3\s+\(info,\s*1\)/m);
  });

  it('pads locators within a group so messages align in a column', () => {
    // Inside a single rule group, the right edge of the locator column is the
    // longest path in the group. That puts the message column at one stable
    // offset for the chunk so the eye can scan messages vertically.
    const out = formatReport([
      {
        sourcePath: 'a-very-long-path/with/many/segments/page.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'shared',
          message: 'ALPHA',
          source: 'mkdocs-material-to-starlight',
          place: { line: 1, column: 1 },
        }),
      },
      {
        sourcePath: 'short.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'shared',
          message: 'BRAVO',
          source: 'mkdocs-material-to-starlight',
          place: { line: 2, column: 3 },
        }),
      },
    ]);
    const bodyLines = out
      .split('\n')
      .filter((l) => l.includes('•'))
      .map((l) => l.replace(/\u001b\[[0-9;]*m/g, '')); // strip ANSI for column math
    expect(bodyLines).toHaveLength(2);
    const alphaCol = bodyLines.find((l) => l.includes('ALPHA'))?.indexOf('ALPHA') ?? -1;
    const bravoCol = bodyLines.find((l) => l.includes('BRAVO'))?.indexOf('BRAVO') ?? -1;
    expect(alphaCol).toBeGreaterThan(0);
    expect(alphaCol).toBe(bravoCol);
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
    // Each diagnostic stays on a single output line so grep / sort still
    // work. Lines are bullet-prefixed for visual chunking, so we locate the
    // diagnostic line by its sourcePath rather than column-zero anchor.
    const reportLine = out.split('\n').find((l) => l.includes('x.md'));
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

  it('truncates long messages to their first sentence with an ellipsis hint', () => {
    // Real regression: long-form diagnostic messages (tab-anchors, blog-config)
    // wrap to column zero in the terminal and shred the visual columns. The
    // CLI shows the punchline; MIGRATION_NOTES.md carries the full detail.
    const out = formatReport([
      {
        sourcePath: 'elements/codehilite.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'tab-anchors-not-preserved',
          message:
            "Content tabs detected. Material auto-generates an anchor link for each tab (e.g. `#linux`) so external pages can deep-link to a specific tab. Starlight's `<TabItem>` has no `id`/anchor prop, so any in-page or cross-page links targeting a tab anchor will resolve to nothing after migration.",
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    expect(out).toContain('Content tabs detected.');
    expect(out).toContain('…');
    expect(out).not.toContain('resolve to nothing after migration');
  });

  it('does not split at digit-preceded periods (e.g. quoted "1." ordinals)', () => {
    // Real regression: ADR titles like "1. Record architecture decisions"
    // contain `1. ` mid-message, which earlier truncated the punchline to
    // `Body H1 "1. …`. Sentence boundary detection must skip digit-preceded
    // periods.
    const out = formatReport([
      {
        sourcePath: 'architecture/decisions/0001.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'duplicate-h1-stripped',
          message:
            'Body H1 "1. Record architecture decisions" was stripped because it duplicates the frontmatter title ("1. Record architecture decisions"). Starlight auto-renders the frontmatter title.',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    expect(out).toContain('was stripped because it duplicates the frontmatter title');
    expect(out).not.toMatch(/Body H1 "1\. …/);
  });

  it('keeps a message that is already short verbatim (no ellipsis)', () => {
    const out = formatReport([
      {
        sourcePath: 'a.md',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'r',
          message: 'target not found',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    expect(out).toContain('target not found');
    expect(out).not.toContain('…');
  });

  it('shows the next-step command when there are warnings but no errors', () => {
    // When astro check (and the converter) report only warnings/info, the
    // build will still work — surface the preview command so the user does
    // not have to reconstruct it from the help text.
    const out = formatReport(
      [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'r',
            message: 'm',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      '/converted/site',
    );
    expect(out).toContain('Next:');
    expect(out).toContain('cd /converted/site');
    expect(out).toContain('npm run dev');
    // The dev server prints its own URL (and the user may have configured a
    // non-default port) — naming one here risks being wrong.
    expect(out).not.toContain('localhost:4321');
  });

  it('omits the next-step command when there are errors (build would fail)', () => {
    const out = formatReport(
      [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'error',
            ruleId: 'r',
            message: 'm',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      '/converted/site',
    );
    expect(out).not.toContain('Next:');
    expect(out).not.toContain('npm run dev');
  });

  it('shows a one-line teaser under folded info groups so actionable info (install X, see Y) is not hidden', () => {
    // Folding raw rows is what cuts the report length, but a bare header
    // (`plugin-foo-mapped (info, 3)`) tells the user nothing about whether
    // to act. Surface the first sentence of the first message as a teaser
    // — one dim indented line per group — so the punchline ("Install
    // starlight-openapi") is visible without --verbose.
    const out = formatReport([
      {
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'plugin-swagger-ui-mapped',
          message:
            'mkdocs-swagger-ui-tag plugin detected. Install `starlight-openapi` and add it to your Astro integration.',
          source: 'mkdocs-material-to-starlight',
        }),
      },
      {
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'plugin-swagger-ui-mapped',
          message: 'another instance',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    expect(out).toMatch(/plugin-swagger-ui-mapped\s+\(info,\s*2\)/);
    expect(out).toContain('mkdocs-swagger-ui-tag plugin detected.');
    // The locator (`mkdocs.yml`) must not appear — the teaser is content,
    // not a row. Rows are still folded.
    const teaserLines = out.split('\n').filter((l) => l.includes('mkdocs-swagger-ui-tag'));
    expect(teaserLines).toHaveLength(1);
    expect(teaserLines[0]).not.toContain('mkdocs.yml:');
  });

  it('renders info groups as header-only by default (rows folded; cuts report length on info-heavy sites)', () => {
    // The default report is the user's first signal — info groups are
    // background context, not actionable items. Surfacing every row inflates
    // the wall-of-text without changing what the user has to do. The header
    // (ruleId + count) stays so the user can see what fired; the full row
    // detail is one click away in MIGRATION_NOTES.md or behind --verbose.
    const diags = Array.from({ length: 4 }, (_, i) => ({
      sourcePath: `file${i}.md`,
      diagnostic: createDiagnostic({
        severity: 'info' as const,
        ruleId: 'plugin-search-replaced',
        message: `details ${i}`,
        source: 'mkdocs-material-to-starlight',
      }),
    }));
    const out = formatReport(diags);
    // Header stays.
    expect(out).toMatch(/plugin-search-replaced\s+\(info,\s*4\)/);
    // Rows are folded — no per-file locator leaks into the default report.
    // (The first message survives as a teaser line; that's the actionability
    // safety net, covered by its own test above.)
    for (let i = 0; i < 4; i += 1) {
      expect(out).not.toContain(`file${i}.md`);
    }
    for (let i = 1; i < 4; i += 1) {
      expect(out).not.toContain(`details ${i}`);
    }
    // Summary still reflects the actual count.
    expect(out).toMatch(/4 info/);
  });

  it('expands info group rows when verbose is true', () => {
    const diags = Array.from({ length: 4 }, (_, i) => ({
      sourcePath: `file${i}.md`,
      diagnostic: createDiagnostic({
        severity: 'info' as const,
        ruleId: 'plugin-search-replaced',
        message: `details ${i}`,
        source: 'mkdocs-material-to-starlight',
      }),
    }));
    const out = formatReport(diags, undefined, { verbose: true });
    expect(out).toContain('file0.md');
    expect(out).toContain('details 0');
  });

  it('keeps warning and error rows visible by default (only info is folded)', () => {
    // Warnings are actionable; errors block the build. Folding either would
    // hide what the user needs to fix. Info folding must not bleed into the
    // other two severities.
    const diags = [
      {
        sourcePath: 'warn.md',
        diagnostic: createDiagnostic({
          severity: 'warning' as const,
          ruleId: 'broken-link',
          message: 'target missing',
          source: 'mkdocs-material-to-starlight',
        }),
      },
      {
        sourcePath: 'err.md',
        diagnostic: createDiagnostic({
          severity: 'error' as const,
          ruleId: 'output-syntax-error',
          message: 'bad MDX',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ];
    const out = formatReport(diags);
    expect(out).toContain('warn.md');
    expect(out).toContain('target missing');
    expect(out).toContain('err.md');
    expect(out).toContain('bad MDX');
  });

  it('hints that folded info detail lives in verbose / MIGRATION_NOTES when info groups were folded', () => {
    // After hiding info rows by default, the user needs a discoverable path
    // back to that detail — name --verbose and MIGRATION_NOTES.md explicitly
    // so they can re-expand without consulting --help.
    const out = formatReport(
      [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'info' as const,
            ruleId: 'plugin-search-replaced',
            message: 'm',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      '/converted/site',
    );
    expect(out).toMatch(/--verbose/);
    expect(out).toMatch(/MIGRATION_NOTES\.md/);
  });

  it('does not emit the verbose hint when nothing was folded (no info diagnostics)', () => {
    const out = formatReport([
      {
        sourcePath: 'a.md',
        diagnostic: createDiagnostic({
          severity: 'warning' as const,
          ruleId: 'r',
          message: 'm',
          source: 'mkdocs-material-to-starlight',
        }),
      },
    ]);
    expect(out).not.toMatch(/--verbose/);
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

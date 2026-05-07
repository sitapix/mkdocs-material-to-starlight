import { describe, expect, it } from 'vitest';
import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';
import { serializeMigrationNotes } from './migration-notes.js';

describe('serializeMigrationNotes', () => {
  it('produces a friendly empty-state with next-steps when there are no findings', () => {
    const out = serializeMigrationNotes({ diagnostics: [], extras: {} });
    expect(out).toContain('# Migration Notes');
    expect(out).toMatch(/no issues|nothing/i);
    // Empty state should still tell the user where to go next.
    expect(out).toContain('npm install');
    expect(out).toContain('https://starlight.astro.build/');
  });

  it('opens with an orientation paragraph that explains the report', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'broken-link',
            message: 'target not found: x.md',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      extras: {},
    });
    expect(out).toContain('# Migration Notes');
    // Some preamble that frames severity meanings, not just the H1.
    expect(out).toMatch(/error|warning|info/i);
  });

  it('shows a counts summary up top', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'error',
            ruleId: 'output-syntax-error',
            message: 'parse fail',
            source: 'convert-file/mdx',
          }),
        },
        {
          sourcePath: 'b.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'broken-link',
            message: 'target not found',
            source: 'mkdocs-material-to-starlight',
          }),
        },
        {
          sourcePath: 'c.md',
          diagnostic: createDiagnostic({
            severity: 'info',
            ruleId: 'mdx-promotion',
            message: 'promoted',
            source: 'convert-file/mdx',
          }),
        },
      ],
      extras: {},
    });
    expect(out).toMatch(/1\s+error/);
    expect(out).toMatch(/1\s+warning/);
    expect(out).toMatch(/1\s+info/);
  });

  it('groups diagnostics by severity (errors first, then warnings, then info)', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'info',
            ruleId: 'mdx-promotion',
            message: 'promoted',
            source: 'convert-file/mdx',
          }),
        },
        {
          sourcePath: 'b.md',
          diagnostic: createDiagnostic({
            severity: 'error',
            ruleId: 'output-syntax-error',
            message: 'parse fail',
            source: 'convert-file/mdx',
          }),
        },
        {
          sourcePath: 'c.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'broken-link',
            message: 'target not found',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      extras: {},
    });
    const errorIdx = out.indexOf('Errors');
    const warningIdx = out.indexOf('Warnings');
    const infoIdx = out.indexOf('Info');
    expect(errorIdx).toBeGreaterThan(-1);
    expect(warningIdx).toBeGreaterThan(errorIdx);
    expect(infoIdx).toBeGreaterThan(warningIdx);
  });

  it('renders each ruleId once with a human description and the registered fix', () => {
    // The renderer must lift `description` and `fix` from the registry so
    // the user sees actionable guidance once per ruleId, not buried inside
    // every single bullet.
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'broken-link',
            message: 'target not found: x.md',
            source: 'mkdocs-material-to-starlight',
          }),
        },
        {
          sourcePath: 'b.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'broken-link',
            message: 'target not found: y.md',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      extras: {},
    });
    // Section heading still keys on the ruleId so users can grep CI logs
    // and find the same id in the report.
    expect(out).toContain('broken-link');
    expect(out).toMatch(/2 occurrence|2 places|\(2\)/);
    // Description from registry pulled in.
    expect(out.toLowerCase()).toContain('does not resolve');
    // Fix from registry pulled in.
    expect(out).toMatch(/Update the link target|restore the missing file/);
    // Per-occurrence locations still listed (so users can jump to them).
    expect(out).toContain('a.md');
    expect(out).toContain('b.md');
    // The verbose per-bullet message field is rendered (so file:line +
    // specifics are visible) but the description+fix are NOT duplicated.
    const fixOccurrences = (out.match(/Update the link target/g) ?? []).length;
    expect(fixOccurrences).toBe(1);
  });

  it('lists unmapped mkdocs.yml extras with hints when the key has a known equivalent', () => {
    const out = serializeMigrationNotes({
      diagnostics: [],
      extras: {
        extra_javascript: ['custom.js'],
        extra_css: ['custom.css'],
        site_author: 'Jane Doe',
        copyright: 'Copyright (c) 2025',
        // Unknown key — no hint, just listed.
        wibble_wobble: true,
      },
    });
    expect(out).toContain('## Unmapped mkdocs.yml fields');
    // Known keys come with a remediation hint.
    expect(out).toContain('extra_css');
    expect(out).toMatch(/customCss|head/i);
    expect(out).toContain('site_author');
    expect(out).toContain('https://starlight.astro.build/reference/configuration/');
    // Unknown keys still appear.
    expect(out).toContain('wibble_wobble');
  });

  it('sorts ruleIds alphabetically WITHIN each severity bucket', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'zzz-rule-late',
            message: 'z',
            source: 'mkdocs-material-to-starlight',
          }),
        },
        {
          sourcePath: 'a',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'aaa-rule-early',
            message: 'a',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      extras: {},
    });
    expect(out.indexOf('aaa-rule-early')).toBeLessThan(out.indexOf('zzz-rule-late'));
  });

  it('appends a starter docsSchema extend snippet when unknown frontmatter fields appear', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'unknown-frontmatter-field',
            message:
              'frontmatter field "tags" is not in Starlight\'s docsSchema; the build will fail unless docsSchema is extended in src/content.config.ts',
            source: 'validate-output/frontmatter',
          }),
        },
        {
          sourcePath: 'b.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'unknown-frontmatter-field',
            message: 'frontmatter field "authors" is not in Starlight\'s docsSchema',
            source: 'validate-output/frontmatter',
          }),
        },
      ],
      extras: {},
    });
    expect(out).toContain('## Extending the docsSchema');
    expect(out).toContain('src/content.config.ts');
    expect(out).toContain('docsSchema({');
    expect(out).toContain('tags:');
    expect(out).toContain('authors:');
    // Linked to the canonical Starlight frontmatter docs.
    expect(out).toContain('https://starlight.astro.build/reference/frontmatter/');
  });

  it('shows the line/column locator on each occurrence bullet', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'broken-link',
            message: 'target not found',
            source: 'mkdocs-material-to-starlight',
            place: { line: 12, column: 4 },
          }),
        },
      ],
      extras: {},
    });
    expect(out).toContain('12:4');
  });

  it('closes with a Next Steps section pointing at npm install / npm run dev / docs', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'broken-link',
            message: 'target not found',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      extras: {},
    });
    expect(out).toContain('## Next steps');
    expect(out).toContain('npm install');
    expect(out).toContain('npm run dev');
    expect(out).toContain('https://starlight.astro.build/');
  });
});

import { describe, expect, it } from 'vitest';
import { serializeMigrationNotes } from './migration-notes.js';
import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';

describe('serializeMigrationNotes', () => {
  it('produces a valid Markdown header even with no diagnostics', () => {
    const out = serializeMigrationNotes({ diagnostics: [], extras: {} });
    expect(out).toContain('# Migration Notes');
    expect(out).toContain('No issues found');
  });

  it('groups diagnostics by ruleId with counts', () => {
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
        {
          sourcePath: 'c.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'snippet-not-found',
            message: 'snippet "z.md" not found',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      extras: {},
    });
    expect(out).toMatch(/## broken-link \(2\)/);
    expect(out).toMatch(/## snippet-not-found \(1\)/);
    expect(out).toContain('a.md');
    expect(out).toContain('b.md');
    expect(out).toContain('c.md');
  });

  it('lists unmappable mkdocs.yml extras under their own section', () => {
    const out = serializeMigrationNotes({
      diagnostics: [],
      extras: {
        extra_javascript: ['custom.js'],
        copyright: 'Copyright (c) 2025',
      },
    });
    expect(out).toContain('## Unmapped mkdocs.yml fields');
    expect(out).toContain('extra_javascript');
    expect(out).toContain('copyright');
  });

  it('sorts diagnostic groups deterministically by ruleId', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'z-rule',
            message: 'z',
            source: 'mkdocs-material-to-starlight',
          }),
        },
        {
          sourcePath: 'a',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'a-rule',
            message: 'a',
            source: 'mkdocs-material-to-starlight',
          }),
        },
      ],
      extras: {},
    });
    expect(out.indexOf('## a-rule')).toBeLessThan(out.indexOf('## z-rule'));
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
        {
          sourcePath: 'c.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'unknown-frontmatter-field',
            message: 'frontmatter field "tags" is not in Starlight\'s docsSchema',
            source: 'validate-output/frontmatter',
          }),
        },
      ],
      extras: {},
    });
    expect(out).toContain('## Extending the docsSchema');
    expect(out).toContain('src/content.config.ts');
    expect(out).toContain('docsSchema({');
    expect(out).toContain('extend:');
    expect(out).toContain('tags:');
    expect(out).toContain('authors:');
    // Each field should appear exactly once even though `tags` appeared twice.
    expect(out.match(/tags:/g)?.length).toBe(1);
  });

  it('does not append the extend snippet when there are no unknown-frontmatter-field diagnostics', () => {
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
    expect(out).not.toContain('Extending the docsSchema');
    expect(out).not.toContain('docsSchema({');
  });

  it('emits the extend fields sorted alphabetically for determinism', () => {
    const out = serializeMigrationNotes({
      diagnostics: [
        {
          sourcePath: 'a.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'unknown-frontmatter-field',
            message: 'frontmatter field "zeta" is not in Starlight\'s docsSchema',
            source: 'validate-output/frontmatter',
          }),
        },
        {
          sourcePath: 'b.md',
          diagnostic: createDiagnostic({
            severity: 'warning',
            ruleId: 'unknown-frontmatter-field',
            message: 'frontmatter field "alpha" is not in Starlight\'s docsSchema',
            source: 'validate-output/frontmatter',
          }),
        },
      ],
      extras: {},
    });
    expect(out.indexOf('alpha:')).toBeLessThan(out.indexOf('zeta:'));
  });

  it('shows the line/column locator when present', () => {
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
});

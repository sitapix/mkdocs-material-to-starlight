import { describe, expect, it } from 'vitest';
import {
  createDiagnostic,
  isFatal,
  type Diagnostic,
  type Severity,
} from './diagnostic.js';

describe('createDiagnostic', () => {
  it('builds a diagnostic with the required fields', () => {
    const d = createDiagnostic({
      severity: 'warning',
      ruleId: 'mkdocs-admonition-inline-modifier-dropped',
      message: 'inline-end modifier dropped; restore via custom CSS',
      source: 'mkdocs-material-to-starlight',
    });
    expect(d.severity).toBe('warning');
    expect(d.ruleId).toBe('mkdocs-admonition-inline-modifier-dropped');
    expect(d.message).toBe('inline-end modifier dropped; restore via custom CSS');
    expect(d.source).toBe('mkdocs-material-to-starlight');
    expect(d.place).toBeUndefined();
  });

  it('preserves an optional source-position locator', () => {
    const d = createDiagnostic({
      severity: 'info',
      ruleId: 'snippet-expanded',
      message: 'expanded snippet at this location',
      source: 'mkdocs-material-to-starlight',
      place: { line: 42, column: 1 },
    });
    expect(d.place).toEqual({ line: 42, column: 1 });
  });

  it('rejects empty rule ids — every diagnostic must be classifiable', () => {
    expect(() =>
      createDiagnostic({
        severity: 'warning',
        ruleId: '',
        message: 'x',
        source: 'mkdocs-material-to-starlight',
      }),
    ).toThrow(/ruleId/);
  });

  it('rejects empty messages — every diagnostic must explain itself', () => {
    expect(() =>
      createDiagnostic({
        severity: 'warning',
        ruleId: 'r',
        message: '',
        source: 'mkdocs-material-to-starlight',
      }),
    ).toThrow(/message/);
  });
});

describe('isFatal', () => {
  it('treats only "error" severity as fatal', () => {
    const cases: ReadonlyArray<[Severity, boolean]> = [
      ['info', false],
      ['warning', false],
      ['error', true],
    ];
    for (const [severity, expected] of cases) {
      const d: Diagnostic = createDiagnostic({
        severity,
        ruleId: 'r',
        message: 'm',
        source: 'mkdocs-material-to-starlight',
      });
      expect(isFatal(d)).toBe(expected);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { createDiagnostic, type Diagnostic } from '../diagnostics/diagnostic.js';
import { runWholeSourceScanners, type WholeSourceScanner } from './whole-source-scanner.js';

function diag(ruleId: string, message = 'm'): Diagnostic {
  return createDiagnostic({ severity: 'info', ruleId, source: 'test', message });
}

describe('runWholeSourceScanners', () => {
  it('returns an empty list when no scanners fire', () => {
    const scanners: WholeSourceScanner[] = [
      { name: 'a', scan: () => null },
      { name: 'b', scan: () => [] },
    ];
    expect(runWholeSourceScanners('any source', 'p.md', scanners)).toEqual([]);
  });

  it('flattens an array-returning scanner with sourcePath tagging', () => {
    const scanners: WholeSourceScanner[] = [
      { name: 'multi', scan: () => [diag('r1'), diag('r2'), diag('r3')] },
    ];
    const out = runWholeSourceScanners('s', 'page.md', scanners);
    expect(out).toHaveLength(3);
    expect(out.every((d) => d.sourcePath === 'page.md')).toBe(true);
    expect(out.map((d) => d.diagnostic.ruleId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('accepts a single-Diagnostic return shape', () => {
    const scanners: WholeSourceScanner[] = [{ name: 'single', scan: () => diag('lone') }];
    const out = runWholeSourceScanners('s', 'page.md', scanners);
    expect(out).toHaveLength(1);
    expect(out[0]?.diagnostic.ruleId).toBe('lone');
  });

  it('treats null and empty array identically (no findings)', () => {
    const a = runWholeSourceScanners('s', 'p.md', [{ name: 'x', scan: () => null }]);
    const b = runWholeSourceScanners('s', 'p.md', [{ name: 'x', scan: () => [] }]);
    expect(a).toEqual(b);
  });

  it('preserves scanner registration order in the output', () => {
    const scanners: WholeSourceScanner[] = [
      { name: 'first', scan: () => diag('A') },
      { name: 'second', scan: () => [diag('B'), diag('C')] },
      { name: 'third', scan: () => diag('D') },
    ];
    const out = runWholeSourceScanners('s', 'p.md', scanners);
    expect(out.map((d) => d.diagnostic.ruleId)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('passes the same source verbatim to every scanner', () => {
    const seen: string[] = [];
    const scanners: WholeSourceScanner[] = [
      {
        name: 'a',
        scan: (s) => {
          seen.push(s);
          return null;
        },
      },
      {
        name: 'b',
        scan: (s) => {
          seen.push(s);
          return null;
        },
      },
    ];
    runWholeSourceScanners('hello world', 'p.md', scanners);
    expect(seen).toEqual(['hello world', 'hello world']);
  });

  it('tags every diagnostic with the supplied sourcePath even across multiple scanners', () => {
    const scanners: WholeSourceScanner[] = [
      { name: 'a', scan: () => diag('A') },
      { name: 'b', scan: () => [diag('B1'), diag('B2')] },
    ];
    const out = runWholeSourceScanners('s', 'docs/intro.md', scanners);
    expect(out.every((d) => d.sourcePath === 'docs/intro.md')).toBe(true);
  });
});

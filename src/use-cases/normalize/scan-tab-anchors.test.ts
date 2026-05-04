import { describe, expect, it } from 'vitest';
import { scanTabAnchors } from './scan-tab-anchors.js';

describe('scanTabAnchors', () => {
  it('returns no diagnostic for source with no tabs', () => {
    expect(scanTabAnchors('# Heading\n\nA paragraph.\n')).toHaveLength(0);
  });

  it('emits one diagnostic when content tabs are present', () => {
    const src = [
      '# Demo',
      '',
      '=== "macOS"',
      '    body',
      '=== "Linux"',
      '    body',
      '',
    ].join('\n');
    const diags = scanTabAnchors(src);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('tab-anchors-not-preserved');
    expect(diags[0]?.severity).toBe('info');
  });

  it('emits exactly one diagnostic per file regardless of how many tabs / groups appear', () => {
    const src = [
      '=== "A"',
      '    x',
      '=== "B"',
      '    y',
      '',
      'paragraph',
      '',
      '=== "C"',
      '    z',
      '=== "D"',
      '    w',
      '',
    ].join('\n');
    expect(scanTabAnchors(src)).toHaveLength(1);
  });

  it('also detects the ===! exclusive marker variant', () => {
    const src = ['===! "A"', '    body', '===! "B"', '    body', ''].join('\n');
    expect(scanTabAnchors(src)).toHaveLength(1);
  });

  it('does not match tab markers inside fenced code blocks', () => {
    const src = ['```', '=== "Inside code"', '    fake body', '```', ''].join('\n');
    expect(scanTabAnchors(src)).toHaveLength(0);
  });

  it('the diagnostic message mentions per-tab anchors and the manual workaround', () => {
    const src = '=== "A"\n    body\n';
    const [diag] = scanTabAnchors(src);
    expect(diag?.message).toMatch(/anchor/i);
    expect(diag?.message).toMatch(/<TabItem|manual|<a id/i);
  });
});

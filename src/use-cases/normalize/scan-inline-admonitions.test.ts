import { describe, expect, it } from 'vitest';
import { scanInlineAdmonitions } from './scan-inline-admonitions.js';

describe('scanInlineAdmonitions', () => {
  it('detects !!! type inline', () => {
    const diagnostics = scanInlineAdmonitions('!!! note inline "Title"\n    body\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('inline-admonition-modifier-dropped');
    expect(diagnostics[0]?.message).toContain('inline');
  });

  it('detects !!! type inline end', () => {
    const diagnostics = scanInlineAdmonitions('!!! warning inline end "Note"\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toContain('inline end');
  });

  it('detects ??? type inline (collapsible)', () => {
    const diagnostics = scanInlineAdmonitions('??? tip inline "Hint"\n');
    expect(diagnostics).toHaveLength(1);
  });

  it('does not match non-inline admonitions', () => {
    expect(scanInlineAdmonitions('!!! note "Title"\n    body\n')).toHaveLength(0);
  });

  it('skips fenced code blocks', () => {
    const src = '```\n!!! note inline "x"\n```\n';
    expect(scanInlineAdmonitions(src)).toHaveLength(0);
  });

  it('reports multiple inline admonitions with line numbers', () => {
    const src = ['!!! note inline "A"', '', '!!! tip inline end "B"'].join('\n');
    const out = scanInlineAdmonitions(src);
    expect(out).toHaveLength(2);
    expect(out[0]?.place?.line).toBe(1);
    expect(out[1]?.place?.line).toBe(3);
  });

  it('returns empty for source without admonitions', () => {
    expect(scanInlineAdmonitions('Plain prose.\n')).toHaveLength(0);
  });
});

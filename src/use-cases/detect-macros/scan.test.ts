import { describe, expect, it } from 'vitest';
import { scanMacroOccurrences } from './scan.js';

describe('scanMacroOccurrences', () => {
  it('returns no diagnostics for source with no macro syntax', () => {
    expect(scanMacroOccurrences('# Just markdown\n\nNo braces here.\n')).toEqual([]);
  });

  it('flags a single {{ var }} occurrence with line/column', () => {
    const diagnostics = scanMacroOccurrences('Line 1\nHello {{ name }} world.\n');
    expect(diagnostics).toHaveLength(1);
    const d = diagnostics[0];
    expect(d?.ruleId).toBe('plugin-macros-occurrence');
    expect(d?.severity).toBe('warning');
    expect(d?.place?.line).toBe(2);
    expect(d?.place?.column).toBeGreaterThan(0);
    expect(d?.message).toContain('{{ name }}');
  });

  it('flags {% if %} block control occurrences', () => {
    const diagnostics = scanMacroOccurrences('{% if user %}admin{% endif %}\n');
    // One open + one close.
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics.every((d) => d.ruleId === 'plugin-macros-occurrence')).toBe(true);
  });

  it('does NOT flag {% include %} or {% include-markdown %} (handled by include-markdown expander)', () => {
    const source = ['{% include "shared.md" %}', '{% include-markdown "snippet.md" %}', ''].join(
      '\n',
    );
    expect(scanMacroOccurrences(source)).toEqual([]);
  });

  it('reports multiple distinct occurrences across the file', () => {
    const source = [
      'Line 1: {{ foo }}',
      'Line 2: plain',
      'Line 3: {% if x %}body{% endif %}',
      '',
    ].join('\n');
    const diagnostics = scanMacroOccurrences(source);
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(diagnostics.map((d) => d.place?.line).sort()).toEqual(expect.arrayContaining([1, 3]));
  });

  it('does not flag literal $double-brace$ in code blocks (pragmatic: scanner is line-based)', () => {
    // We intentionally do not parse markdown. Code fences with macro syntax
    // ARE flagged — users may want to know about them anyway. Document
    // current behavior.
    const source = '```\n{{ inside_code }}\n```\n';
    // Current behavior: flagged. If we ever change it, this test will fail
    // and force a conscious decision.
    expect(scanMacroOccurrences(source).length).toBeGreaterThan(0);
  });

  it('captures the matched expression in the diagnostic message', () => {
    const diagnostics = scanMacroOccurrences('Hello {{ user.name | upper }}\n');
    expect(diagnostics[0]?.message).toContain('{{ user.name | upper }}');
  });

  it('idempotency: scanning the same source twice yields identical diagnostics', () => {
    const source = '{{ a }}\n{% if b %}c{% endif %}\n';
    expect(scanMacroOccurrences(source)).toEqual(scanMacroOccurrences(source));
  });
});

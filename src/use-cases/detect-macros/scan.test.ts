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

  it('does NOT flag macro syntax inside fenced code blocks (documentation examples)', () => {
    // Docs that teach Jinja2 by example show `{{ var }}` in code fences. Those
    // are not live macros and must not surface as warnings. Conscious reversal
    // of the prior "flag everything, the user might want to know" policy.
    const source = '```\n{{ inside_code }}\n{% if x %}body{% endif %}\n```\n';
    expect(scanMacroOccurrences(source)).toEqual([]);
  });

  it('does NOT flag macro syntax inside tilde-fenced code blocks', () => {
    const source = '~~~\n{{ inside_code }}\n~~~\n';
    expect(scanMacroOccurrences(source)).toEqual([]);
  });

  it('still flags macros outside fences when a fenced block sits elsewhere in the file', () => {
    const source = [
      'Live: {{ live_var }}',
      '',
      '```',
      '{{ example_only }}',
      '```',
      '',
      'Also live: {{ another }}',
      '',
    ].join('\n');
    const diagnostics = scanMacroOccurrences(source);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.place?.line)).toEqual([1, 7]);
  });

  it('does NOT flag macro syntax inside inline code spans', () => {
    const source = 'Inline example: `{{ var }}` should not flag.\n';
    expect(scanMacroOccurrences(source)).toEqual([]);
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

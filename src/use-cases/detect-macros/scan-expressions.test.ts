import { describe, expect, it } from 'vitest';
import { scanMacroExpressions } from './scan-expressions.js';

describe('scanMacroExpressions', () => {
  it('returns empty array for source with no {{ expr }}', () => {
    expect(scanMacroExpressions('# Heading\n\nPlain text.\n')).toHaveLength(0);
  });

  it('detects a single {{ var }} occurrence', () => {
    const diags = scanMacroExpressions('Value: {{ foo }}\n');
    expect(diags).toHaveLength(1);
    expect(diags[0]?.ruleId).toBe('macros-expression-detected');
    expect(diags[0]?.severity).toBe('info');
    expect(diags[0]?.message).toContain('{{ foo }}');
    expect(diags[0]?.place?.line).toBe(1);
  });

  it('skips {{ expr }} inside a fenced code block', () => {
    const source = '```python\nx = {{ foo }}\n```\n';
    expect(scanMacroExpressions(source)).toHaveLength(0);
  });

  it('detects multiple expressions on separate lines', () => {
    const source = 'A: {{ x }}\nB: plain\nC: {{ y }}\n';
    const diags = scanMacroExpressions(source);
    expect(diags).toHaveLength(2);
    expect(diags[0]?.place?.line).toBe(1);
    expect(diags[1]?.place?.line).toBe(3);
  });

  it('resumes detection after a code fence closes', () => {
    const source = '{{ before }}\n```\n{{ inside }}\n```\n{{ after }}\n';
    const diags = scanMacroExpressions(source);
    expect(diags.map((d) => d.place?.line).sort()).toEqual([1, 5]);
  });

  it('does not flag {% ... %} statement blocks', () => {
    const source = '{% if user %}admin{% endif %}\n';
    expect(scanMacroExpressions(source)).toHaveLength(0);
  });
});

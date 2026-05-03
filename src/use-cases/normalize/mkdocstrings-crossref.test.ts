import { describe, expect, it } from 'vitest';
import { normalizeMkdocstringsCrossRefs } from './mkdocstrings-crossref.js';

describe('normalizeMkdocstringsCrossRefs', () => {
  it('passes through text with no cross-refs', () => {
    const input = '# Title\n\nPlain text with `code`.\n';
    const result = normalizeMkdocstringsCrossRefs(input);
    expect(result.text).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('reduces [`bool`][] to `bool`', () => {
    const input = 'Use [`bool`][] for boolean values.\n';
    const result = normalizeMkdocstringsCrossRefs(input);
    expect(result.text).toBe('Use `bool` for boolean values.\n');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.ruleId).toBe('mkdocstrings-cross-ref-stripped');
  });

  it('reduces [`StrictBool`][pydantic.types.StrictBool] to `StrictBool`', () => {
    const input = 'The [`StrictBool`][pydantic.types.StrictBool] type.\n';
    const result = normalizeMkdocstringsCrossRefs(input);
    expect(result.text).toBe('The `StrictBool` type.\n');
    expect(result.diagnostics).toHaveLength(1);
  });

  it('handles multiple cross-refs on the same line', () => {
    const input = 'Both [`bool`][] and [`int`][] are basic types.\n';
    const result = normalizeMkdocstringsCrossRefs(input);
    expect(result.text).toBe('Both `bool` and `int` are basic types.\n');
    expect(result.diagnostics).toHaveLength(2);
  });

  it('does not touch cross-refs inside fenced code blocks', () => {
    const input = '```python\nx: [`bool`][] = True\n```\n';
    const result = normalizeMkdocstringsCrossRefs(input);
    expect(result.text).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('does not touch plain [text][target] links (no backticks inside)', () => {
    const input = 'See [the docs][docs.link] for more.\n';
    const result = normalizeMkdocstringsCrossRefs(input);
    expect(result.text).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('is idempotent', () => {
    const input = 'Use [`bool`][] for booleans.\n';
    const once = normalizeMkdocstringsCrossRefs(input);
    const twice = normalizeMkdocstringsCrossRefs(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.diagnostics).toHaveLength(0);
  });

  it('records line number in the diagnostic', () => {
    const input = '# Title\n\nUse [`bool`][] here.\n';
    const result = normalizeMkdocstringsCrossRefs(input);
    expect(result.diagnostics[0]?.place?.line).toBe(3);
  });
});

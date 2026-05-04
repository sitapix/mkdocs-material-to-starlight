import { describe, expect, it } from 'vitest';
import { escapeJsxExpressionsForMdx } from './escape-jsx-expressions.js';

describe('escapeJsxExpressionsForMdx', () => {
  it('wraps {{ ... }} occurrences in inline code so MDX does not evaluate them', () => {
    const out = escapeJsxExpressionsForMdx('{{ version }}.\n');
    expect(out).toContain('`{{ version }}`');
    // Should not leave bare {{ }} which MDX would try to evaluate.
    expect(out).not.toMatch(/(?<!`)\{\{[^`]/);
  });

  it('does not wrap {{ ... }} occurrences inside fenced code blocks', () => {
    const src = '```jinja\n{{ var }}\n```\n';
    expect(escapeJsxExpressionsForMdx(src)).toBe(src);
  });

  it('does not wrap {{ ... }} occurrences inside inline backticks', () => {
    const src = 'Use `{{ var }}` for templating.\n';
    expect(escapeJsxExpressionsForMdx(src)).toBe(src);
  });

  it('handles multiple expressions on the same line', () => {
    const out = escapeJsxExpressionsForMdx('Foo {{ a }} bar {{ b }} baz.\n');
    expect(out).toContain('`{{ a }}`');
    expect(out).toContain('`{{ b }}`');
  });

  it('handles a real polars-style expression with nested punctuation', () => {
    const out = escapeJsxExpressionsForMdx(
      "{{code_block('user-guide/getting-started','df',['DataFrame'])}}\n",
    );
    expect(out).toContain("`{{code_block('user-guide/getting-started','df',['DataFrame'])}}`");
  });

  it('passes through source with no expressions unchanged', () => {
    const src = '# Title\n\nNo expressions.\n';
    expect(escapeJsxExpressionsForMdx(src)).toBe(src);
  });

  it('idempotent: re-applying does not double-wrap', () => {
    const src = '{{ x }}.\n';
    const first = escapeJsxExpressionsForMdx(src);
    const second = escapeJsxExpressionsForMdx(first);
    expect(second).toBe(first);
  });

  it('handles multi-line {{...}} expressions (real-world polars shape)', () => {
    // Real-world polars source: code_block macro split across two lines
    const src = "{{code_block('user-guide', 'semi-join', [],\n['join-flag'])}}\n";
    const out = escapeJsxExpressionsForMdx(src);
    // Multi-line spans cannot be inline-code-wrapped (backticks don't span lines).
    // The bare `{{` must NOT survive at the start of a line in .mdx output.
    const lines = out.split('\n');
    for (const line of lines) {
      // Either the line doesn't start with {{ at all, or it's been escaped.
      if (line.startsWith('{{')) {
        throw new Error(`unescaped {{ at start of line: ${line}`);
      }
    }
  });
});

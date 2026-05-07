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

  it('handles a real Jinja-style expression with nested punctuation', () => {
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

  it('handles multi-line {{...}} expressions (real-world Jinja shape)', () => {
    // Real-world source: code_block macro split across two lines
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

  it('wraps {% block %} (Jinja control flow) in inline code', () => {
    const out = escapeJsxExpressionsForMdx('{% if user %}admin{% endif %}\n');
    expect(out).toContain('`{% if user %}`');
    expect(out).toContain('`{% endif %}`');
    // No bare `{%` should remain outside backticks.
    expect(out).not.toMatch(/(?<!`)\{%[^`]/);
  });

  it('wraps Jinja whitespace-control variants ({%- ... -%})', () => {
    const out = escapeJsxExpressionsForMdx('{%- set x = 1 -%}\n');
    expect(out).toContain('`{%- set x = 1 -%}`');
  });

  it('wraps {# Jinja comment #} in inline code', () => {
    const out = escapeJsxExpressionsForMdx('{# this is a comment #}\n');
    expect(out).toContain('`{# this is a comment #}`');
  });

  it('does not wrap {% inside fenced code blocks', () => {
    const src = '```jinja\n{% if user %}admin{% endif %}\n```\n';
    expect(escapeJsxExpressionsForMdx(src)).toBe(src);
  });

  it('handles real-world governance shape (set + for loop)', () => {
    // Real input from gitlab.com/alasca.cloud/governance: page-level Jinja
    // template directives mixed with body content. None of these should
    // survive as bare `{%` in MDX.
    const src = '{% set project = projects.arko %}\n# {{ project.name }}\n';
    const out = escapeJsxExpressionsForMdx(src);
    expect(out).toContain('`{% set project = projects.arko %}`');
    expect(out).toContain('`{{ project.name }}`');
  });

  it('does NOT inline-code-wrap {{ ... }} sitting inside a markdown link URL', () => {
    // Real-world (cv4x_svstudio-manual/docs/index.md): a markdown link
    // contains a Jinja template variable in its URL:
    //   [text {{ git.short_commit }}](https://example.com/commit/{{ git.short_commit }})
    // Wrapping the URL-side `{{...}}` in backticks puts a backtick INSIDE
    // the link target, which remark mis-parses (the target gets split on
    // the backtick → cascading malformed link → MDX acorn parse failure).
    // Inside a URL, entity-escape (`&#123;&#123;`) is the safe form: it
    // satisfies MDX without confusing the link parser.
    const src = '[text {{ x }}](https://example.com/commit/{{ x }})\n';
    const out = escapeJsxExpressionsForMdx(src);
    // Link text side: backtick-wrapped (existing behaviour).
    expect(out).toContain('[text `{{ x }}`]');
    // Link URL side: entity-escaped, NOT backtick-wrapped.
    expect(out).toContain('commit/&#123;&#123; x &#125;&#125;');
    expect(out).not.toContain('commit/`{{');
  });

  it('escapes multi-line {% blocks %} via entity escape', () => {
    const src = '{% for item in items %}\n  - {{ item }}\n{% endfor %}\n';
    const out = escapeJsxExpressionsForMdx(src);
    // Single-line {% if %} and {% endif %} get inline-code-wrapped first;
    // any remaining `{%` (e.g., that the regex couldn't match because it
    // genuinely spanned lines) gets entity-escaped.
    expect(out).not.toMatch(/^\{%/m);
  });
});

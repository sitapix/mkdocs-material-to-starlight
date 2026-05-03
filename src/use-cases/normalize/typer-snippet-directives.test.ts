import { describe, expect, it } from 'vitest';
import { normalizeTyperSnippetDirectives } from './typer-snippet-directives.js';

describe('normalizeTyperSnippetDirectives', () => {
  it('passes through text with no snippet directives', () => {
    const input = 'Just a paragraph.\n\n## Heading\n\nMore text.\n';
    const result = normalizeTyperSnippetDirectives(input);
    expect(result.text).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('replaces a {* path *} line with an HTML TODO comment', () => {
    const input = '{* docs_src/first_steps/tutorial001.py *}\n';
    const result = normalizeTyperSnippetDirectives(input);
    expect(result.text).toMatch(/TODO.*typer snippet directive/);
    expect(result.text).toMatch(/docs_src\/first_steps\/tutorial001\.py/);
    expect(result.text).not.toMatch(/```text/);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.ruleId).toBe('typer-snippet-directive-detected');
  });

  it('strips hl[...] highlight hints from the path', () => {
    const input = '{* docs_src/example.py hl[3] *}\n';
    const result = normalizeTyperSnippetDirectives(input);
    expect(result.text).toMatch(/docs_src\/example\.py/);
    expect(result.text).not.toMatch(/hl\[3\]/);
    expect(result.diagnostics).toHaveLength(1);
  });

  it('handles multiple directives independently', () => {
    const input = '{* a.py *}\n\n{* b.py *}\n';
    const result = normalizeTyperSnippetDirectives(input);
    expect(result.text).toMatch(/a\.py/);
    expect(result.text).toMatch(/b\.py/);
    expect(result.diagnostics).toHaveLength(2);
  });

  it('does not touch {* ... *} inside a fenced code block', () => {
    const input = '```text\n{* docs_src/example.py *}\n```\n';
    const result = normalizeTyperSnippetDirectives(input);
    expect(result.text).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('does not match inline {* ... *} in the middle of a paragraph', () => {
    const input = 'Here is a token {* inline *} in prose.\n';
    const result = normalizeTyperSnippetDirectives(input);
    expect(result.text).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('is idempotent', () => {
    const input = '{* docs_src/foo.py *}\n';
    const once = normalizeTyperSnippetDirectives(input);
    const twice = normalizeTyperSnippetDirectives(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.diagnostics).toHaveLength(0);
  });

  it('records the line number in the diagnostic place', () => {
    const input = '# Title\n\n{* docs_src/example.py *}\n';
    const result = normalizeTyperSnippetDirectives(input);
    expect(result.diagnostics[0]?.place?.line).toBe(3);
  });
});

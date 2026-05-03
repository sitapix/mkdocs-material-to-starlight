import { describe, expect, it } from 'vitest';
import { normalizeAdmonitions } from './admonitions.js';

describe('normalizeAdmonitions', () => {
  it('passes through text containing no admonitions', () => {
    const src = '# Heading\n\nA plain paragraph.\n\n- list item\n';
    expect(normalizeAdmonitions(src)).toBe(src);
  });

  it('rewrites a bare !!! note block into :::note', () => {
    const src = '!!! note\n    Body line one.\n    Body line two.\n\nAfter.\n';
    const expected = ':::note\nBody line one.\nBody line two.\n:::\n\nAfter.\n';
    expect(normalizeAdmonitions(src)).toBe(expected);
  });

  it('preserves a quoted title with bracketed-attribute syntax', () => {
    const src = '!!! warning "Heads up"\n    Read this.\n';
    expect(normalizeAdmonitions(src)).toBe(
      ':::warning[Heads up]\nRead this.\n:::\n',
    );
  });

  it('translates ??? as a collapsible directive (data-collapsible attribute)', () => {
    const src = '??? tip\n    Hidden by default.\n';
    expect(normalizeAdmonitions(src)).toBe(
      ':::tip{collapsible="closed"}\nHidden by default.\n:::\n',
    );
  });

  it('translates ???+ as a collapsible-open directive', () => {
    const src = '???+ tip\n    Visible by default.\n';
    expect(normalizeAdmonitions(src)).toBe(
      ':::tip{collapsible="open"}\nVisible by default.\n:::\n',
    );
  });

  it('preserves an inline-end modifier in attribute form', () => {
    const src = '!!! info inline end "Aside"\n    Floats right.\n';
    expect(normalizeAdmonitions(src)).toBe(
      ':::info[Aside]{inline="end"}\nFloats right.\n:::\n',
    );
  });

  it('rewrites multiple admonitions in one document independently', () => {
    const src =
      '!!! note\n    First.\n\n!!! warning\n    Second.\n';
    expect(normalizeAdmonitions(src)).toBe(
      ':::note\nFirst.\n:::\n\n:::warning\nSecond.\n:::\n',
    );
  });

  it('leaves an admonition with empty body as a marker-only directive', () => {
    const src = '!!! note\n\nNext paragraph.\n';
    expect(normalizeAdmonitions(src)).toBe(
      ':::note\n:::\n\nNext paragraph.\n',
    );
  });

  it('does not touch lines that look like admonitions but are inside fenced code', () => {
    const src = [
      '```',
      '!!! note',
      '    body',
      '```',
      '',
    ].join('\n');
    expect(normalizeAdmonitions(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = '!!! note "Title"\n    Body.\n';
    const once = normalizeAdmonitions(src);
    const twice = normalizeAdmonitions(once);
    expect(twice).toBe(once);
  });
});

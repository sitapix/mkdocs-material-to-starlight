import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { transformAdmonitionDirectives } from './admonition-directive.js';

function process(source: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(transformAdmonitionDirectives)
    .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
    .processSync(source);
  return String(file);
}

describe('transformAdmonitionDirectives', () => {
  it('passes through plain markdown unchanged', () => {
    const out = process('# Heading\n\nA paragraph.\n');
    expect(out).toContain('# Heading');
    expect(out).toContain('A paragraph.');
  });

  it('keeps a :::note directive as :::note (already a Starlight aside type)', () => {
    const out = process(':::note\nBody text.\n:::\n');
    expect(out).toContain(':::note');
    expect(out).toContain('Body text.');
  });

  it('renames :::warning to :::caution per the Material→Starlight mapping', () => {
    const out = process(':::warning\nBe careful.\n:::\n');
    expect(out).toContain(':::caution');
    expect(out).not.toContain(':::warning');
  });

  it('renames :::failure to :::danger', () => {
    const out = process(':::failure\nbroken.\n:::\n');
    expect(out).toContain(':::danger');
    expect(out).not.toContain(':::failure');
  });

  it('preserves a directive label (title) across rename', () => {
    const out = process(':::warning[Heads up]\nBe careful.\n:::\n');
    expect(out).toContain(':::caution');
    expect(out).toContain('Heads up');
  });

  it('attaches an icon attribute when the mapping carries an icon hint', () => {
    const out = process(':::success\nokay.\n:::\n');
    expect(out).toContain(':::tip');
    expect(out).toMatch(/icon="approve-check"|icon=approve-check/);
  });

  it('converts :::quote to a blockquote rather than an aside', () => {
    const out = process(':::quote\nA quoted line.\n:::\n');
    expect(out).not.toContain(':::quote');
    expect(out).not.toMatch(/:::tip|:::note|:::caution|:::danger/);
    expect(out).toContain('A quoted line.');
    expect(out).toMatch(/^>\s+A quoted line\.|^>A quoted line\./m);
  });

  it('leaves a :::tabs directive untouched (different namespace)', () => {
    const out = process(':::tabs\nbody\n:::\n');
    expect(out).toContain(':::tabs');
  });

  it('is idempotent — running the converted output through the same pipeline is a no-op', () => {
    const first = process(':::warning\nx\n:::\n');
    const second = process(first);
    expect(second).toBe(first);
  });

  it('converts a collapsible-closed admonition (collapsible="closed") to <details>', () => {
    const out = process(':::tip{collapsible="closed"}\nHidden body.\n:::\n');
    expect(out).toMatch(/<details>/);
    expect(out).toContain('Hidden body.');
    expect(out).not.toContain(':::tip');
  });

  it('converts a collapsible-open admonition to <details open>', () => {
    const out = process(':::tip{collapsible="open"}\nVisible body.\n:::\n');
    expect(out).toMatch(/<details open>/);
    expect(out).toContain('Visible body.');
  });

  it('preserves the title as a <summary> element on collapsible admonitions', () => {
    const out = process(':::warning[Heads up]{collapsible="closed"}\nBe careful.\n:::\n');
    expect(out).toMatch(/<details>/);
    expect(out).toContain('<summary>Heads up</summary>');
    expect(out).toContain('Be careful.');
  });
});

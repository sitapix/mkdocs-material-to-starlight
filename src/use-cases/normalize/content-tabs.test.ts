import { describe, expect, it } from 'vitest';
import { normalizeContentTabs } from './content-tabs.js';

describe('normalizeContentTabs', () => {
  it('passes through text containing no tabs', () => {
    const src = '# Heading\n\nA plain paragraph.\n';
    expect(normalizeContentTabs(src)).toBe(src);
  });

  it('groups two adjacent tabs into a single :::tabs container', () => {
    const src = [
      '=== "C"',
      '    code one',
      '',
      '=== "C++"',
      '    code two',
      '',
    ].join('\n');
    const expected = [
      '::::tabs',
      ':::tab[C]',
      'code one',
      ':::',
      ':::tab[C++]',
      'code two',
      ':::',
      '::::',
      '',
    ].join('\n');
    expect(normalizeContentTabs(src)).toBe(expected);
  });

  it('emits a single-tab group when only one === block is present', () => {
    const src = '=== "Only"\n    body\n';
    const expected = [
      '::::tabs',
      ':::tab[Only]',
      'body',
      ':::',
      '::::',
      '',
    ].join('\n');
    expect(normalizeContentTabs(src)).toBe(expected);
  });

  it('marks the exclusive variant on the container', () => {
    const src = '===! "A"\n    body a\n\n=== "B"\n    body b\n';
    const out = normalizeContentTabs(src);
    expect(out.startsWith('::::tabs{exclusive}\n')).toBe(true);
  });

  it('separates two non-adjacent tab groups when divided by a paragraph', () => {
    const src = [
      '=== "A"',
      '    one',
      '',
      'A paragraph between groups.',
      '',
      '=== "B"',
      '    two',
      '',
    ].join('\n');
    const out = normalizeContentTabs(src);
    expect(out.match(/::::tabs/g)?.length).toBe(2);
  });

  it('does not touch tab-looking lines inside fenced code', () => {
    const src = [
      '```',
      '=== "Not a tab"',
      '    just code',
      '```',
      '',
    ].join('\n');
    expect(normalizeContentTabs(src)).toBe(src);
  });

  it('is idempotent', () => {
    const src = '=== "X"\n    body\n\n=== "Y"\n    body\n';
    const once = normalizeContentTabs(src);
    expect(normalizeContentTabs(once)).toBe(once);
  });

  it('recurses into tab bodies to convert nested tab groups (hatch regression)', () => {
    // Real Hatch regression: `docs/install.md` has nested `=== "..."` tabs
    // inside an outer `=== "macOS"` body. The inner tab markers must convert
    // too; otherwise they survive as literal `\=== "..."` text after
    // remark-stringify escapes them. The body coordinate system starts at
    // indent 0 (after readIndentedBlock dedents), so recursing the same
    // normalizer over the body picks them up naturally.
    const src = [
      '=== "macOS"',
      '    === "GUI"',
      '        gui body',
      '',
      '    === "CLI"',
      '        cli body',
      '',
      '=== "Windows"',
      '    win body',
      '',
    ].join('\n');
    const out = normalizeContentTabs(src);
    // Outer group: ::::tabs / :::tab[macOS] / :::tab[Windows] / ::::
    expect(out).toMatch(/^::::tabs/m);
    expect(out).toMatch(/^:::tab\[macOS\]/m);
    expect(out).toMatch(/^:::tab\[Windows\]/m);
    // Inner group must be present (indented one level inside the outer body).
    expect(out).toMatch(/::::tabs[\s\S]*::::tabs/);
    expect(out).toMatch(/:::tab\[GUI\]/);
    expect(out).toMatch(/:::tab\[CLI\]/);
    // No leftover `=== "..."` source markers.
    expect(out).not.toMatch(/^=== "/m);
    expect(out).not.toMatch(/^\s+=== "/m);
  });

  it('is idempotent for nested tab groups', () => {
    const src = [
      '=== "Outer"',
      '    === "Inner"',
      '        body',
      '',
    ].join('\n');
    const once = normalizeContentTabs(src);
    expect(normalizeContentTabs(once)).toBe(once);
  });
});

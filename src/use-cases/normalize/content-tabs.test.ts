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
});

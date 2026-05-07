import { describe, expect, it } from 'vitest';
import { normalizeInlineHilite } from './inlinehilite.js';

describe('normalizeInlineHilite', () => {
  it('strips :::lang prefix from inline code', () => {
    expect(normalizeInlineHilite('Use `:::python x = 1` here.')).toBe('Use `x = 1` here.');
  });

  it('strips #!lang prefix from inline code', () => {
    expect(normalizeInlineHilite('Use `#!python x = 1` here.')).toBe('Use `x = 1` here.');
  });

  it('leaves regular inline code alone', () => {
    expect(normalizeInlineHilite('Plain `inline code`.')).toBe('Plain `inline code`.');
  });

  it('handles multiple occurrences', () => {
    expect(normalizeInlineHilite('`:::py a` and `#!js b`.')).toBe('`a` and `b`.');
  });

  it('idempotent', () => {
    const src = 'Use `:::python x = 1`.';
    expect(normalizeInlineHilite(normalizeInlineHilite(src))).toBe(normalizeInlineHilite(src));
  });
});

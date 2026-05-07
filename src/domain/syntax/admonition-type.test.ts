import { describe, expect, it } from 'vitest';
import { ADMONITION_TYPES, type AdmonitionType, parseAdmonitionType } from './admonition-type.js';

describe('parseAdmonitionType', () => {
  it('recognizes every Material for MkDocs admonition type qualifier', () => {
    const expected: ReadonlyArray<AdmonitionType> = [
      'note',
      'abstract',
      'info',
      'tip',
      'success',
      'question',
      'warning',
      'failure',
      'danger',
      'bug',
      'example',
      'quote',
    ];
    expect([...ADMONITION_TYPES]).toEqual([...expected]);
  });

  it('returns the typed value for a recognized qualifier', () => {
    const result = parseAdmonitionType('warning');
    expect(result).toEqual({ type: 'warning', isFallback: false, original: 'warning' });
  });

  it('falls back to "note" for unknown qualifiers, preserving the original', () => {
    const result = parseAdmonitionType('totally-made-up');
    expect(result).toEqual({
      type: 'note',
      isFallback: true,
      original: 'totally-made-up',
    });
  });

  it('is case-sensitive — Material qualifiers are lowercase, so "Warning" is unknown', () => {
    const result = parseAdmonitionType('Warning');
    expect(result.isFallback).toBe(true);
    expect(result.type).toBe('note');
    expect(result.original).toBe('Warning');
  });

  it('treats the empty string as unknown (caller decides whether to ignore the block)', () => {
    const result = parseAdmonitionType('');
    expect(result.isFallback).toBe(true);
    expect(result.original).toBe('');
  });

  describe('Material deprecated aliases resolve to canonical types', () => {
    const cases: ReadonlyArray<readonly [string, AdmonitionType]> = [
      ['summary', 'abstract'],
      ['tldr', 'abstract'],
      ['hint', 'tip'],
      ['important', 'tip'],
      ['check', 'success'],
      ['done', 'success'],
      ['help', 'question'],
      ['faq', 'question'],
      ['caution', 'warning'],
      ['attention', 'warning'],
      ['fail', 'failure'],
      ['missing', 'failure'],
      ['error', 'danger'],
      ['cite', 'quote'],
    ];
    for (const [alias, canonical] of cases) {
      it(`maps "${alias}" to "${canonical}"`, () => {
        const result = parseAdmonitionType(alias);
        expect(result.type).toBe(canonical);
        expect(result.isFallback).toBe(false);
        expect(result.isAlias).toBe(true);
        expect(result.original).toBe(alias);
      });
    }
  });

  it('canonical types are not flagged as aliases', () => {
    for (const t of ADMONITION_TYPES) {
      const result = parseAdmonitionType(t);
      expect(result.isAlias ?? false).toBe(false);
      expect(result.isFallback).toBe(false);
    }
  });
});

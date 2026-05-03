import { describe, expect, it } from 'vitest';
import { parseAdmonitionType, ADMONITION_TYPES, type AdmonitionType } from './admonition-type.js';

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
});

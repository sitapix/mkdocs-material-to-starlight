import { describe, expect, it } from 'vitest';
import { normalizeInlineMarks } from './inline-marks.js';

describe('normalizeInlineMarks', () => {
  it('passes through text containing none of the inline mark patterns', () => {
    const src = '# Heading\n\nA plain paragraph.\n';
    expect(normalizeInlineMarks(src)).toBe(src);
  });

  describe('mark (==text==)', () => {
    it('rewrites highlighted spans into <mark> elements', () => {
      expect(normalizeInlineMarks('See ==this== now.')).toBe('See <mark>this</mark> now.');
    });

    it('handles multiple occurrences in a paragraph', () => {
      expect(normalizeInlineMarks('==a== and ==b==')).toBe('<mark>a</mark> and <mark>b</mark>');
    });

    it('rejects unbalanced or empty mark spans', () => {
      expect(normalizeInlineMarks('see ==')).toBe('see ==');
      expect(normalizeInlineMarks('==text without close')).toBe('==text without close');
    });
  });

  describe('insert (^^text^^)', () => {
    it('rewrites ^^text^^ into <ins>', () => {
      expect(normalizeInlineMarks('^^Insert^^')).toBe('<ins>Insert</ins>');
    });

    it('rewrites ^^...^^ before single-caret superscript so the outer markers win', () => {
      // Without INS-before-SUP ordering, the inner `^Insert^` would match
      // SUP_RE, producing `^<sup>Insert</sup>^` (broken).
      expect(normalizeInlineMarks('See ^^Insert^^ here.')).toBe('See <ins>Insert</ins> here.');
    });

    it('does not interfere with single-caret superscript on the same line', () => {
      expect(normalizeInlineMarks('^^Note^^ X^2^')).toBe('<ins>Note</ins> X<sup>2</sup>');
    });
  });

  describe('subscript (H~2~O)', () => {
    it('rewrites ~text~ into <sub>', () => {
      expect(normalizeInlineMarks('H~2~O')).toBe('H<sub>2</sub>O');
    });

    it('handles multi-character subscripts', () => {
      expect(normalizeInlineMarks('CO~max~')).toBe('CO<sub>max</sub>');
    });
  });

  describe('superscript (2^10^)', () => {
    it('rewrites ^text^ into <sup>', () => {
      expect(normalizeInlineMarks('2^10^')).toBe('2<sup>10</sup>');
    });

    it('handles word superscripts', () => {
      expect(normalizeInlineMarks('e^iπ^')).toBe('e<sup>iπ</sup>');
    });
  });

  describe('keyboard keys (++ctrl+alt+del++)', () => {
    it('rewrites a single key', () => {
      expect(normalizeInlineMarks('Press ++enter++ now.')).toBe('Press <kbd>Enter</kbd> now.');
    });

    it('rewrites a key combination joining with the literal + character', () => {
      expect(normalizeInlineMarks('++ctrl+alt+del++')).toBe(
        '<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Del</kbd>',
      );
    });

    it('preserves unknown key tokens verbatim with title-case', () => {
      expect(normalizeInlineMarks('++space++')).toBe('<kbd>Space</kbd>');
    });
  });

  it('does not rewrite patterns inside fenced code', () => {
    const src = '```\n==text==\n```\n';
    expect(normalizeInlineMarks(src)).toBe(src);
  });

  it('does not rewrite patterns inside inline backtick code', () => {
    const src = 'literal `==text==` here.';
    expect(normalizeInlineMarks(src)).toBe(src);
  });

  it('is idempotent — converted output passes through untouched', () => {
    const first = normalizeInlineMarks('==hi== and 2^10^ and ++enter++');
    expect(normalizeInlineMarks(first)).toBe(first);
  });
});

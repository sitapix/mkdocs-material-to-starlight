import { describe, expect, it } from 'vitest';
import { unescapeDirectiveFences } from './unescape-directive-fences.js';

describe('unescapeDirectiveFences', () => {
  it('strips leading \\\\ from a bare \\\\::: line', () => {
    expect(unescapeDirectiveFences('\\:::')).toBe(':::');
  });

  it('strips leading \\\\ from any colon depth (≥3)', () => {
    expect(unescapeDirectiveFences('\\::::')).toBe('::::');
    expect(unescapeDirectiveFences('\\::::::')).toBe('::::::');
  });

  it('preserves indentation', () => {
    expect(unescapeDirectiveFences('    \\::::')).toBe('    ::::');
  });

  it('does NOT touch inline escaped colons in prose', () => {
    const input = 'See the syntax `\\:::` in this sentence.';
    expect(unescapeDirectiveFences(input)).toBe(input);
  });

  it('does NOT touch :: (only 2 colons) at line start', () => {
    const input = '\\::';
    expect(unescapeDirectiveFences(input)).toBe(input);
  });

  it('handles multiple lines independently', () => {
    const input = ['hello', '\\:::', 'middle', '\\::::', 'end'].join('\n');
    const expected = ['hello', ':::', 'middle', '::::', 'end'].join('\n');
    expect(unescapeDirectiveFences(input)).toBe(expected);
  });

  it('is idempotent — second pass is a no-op', () => {
    const once = unescapeDirectiveFences('hello\n\\:::\nworld\n');
    expect(unescapeDirectiveFences(once)).toBe(once);
  });

  it('handles trailing whitespace on the fence line', () => {
    expect(unescapeDirectiveFences('\\:::   ')).toBe(':::');
  });
});

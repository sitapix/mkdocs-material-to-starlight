import { describe, expect, it } from 'vitest';
import { sanitizeForSingleLine, stripTerminalEscapes } from './sanitize-terminal-output.js';

describe('stripTerminalEscapes', () => {
  it('passes through plain ASCII text unchanged', () => {
    expect(stripTerminalEscapes('Hello, world.')).toBe('Hello, world.');
  });

  it('preserves tab and newline (legitimate whitespace)', () => {
    expect(stripTerminalEscapes('a\tb\nc')).toBe('a\tb\nc');
  });

  it('strips a CSI cursor-movement sequence', () => {
    // ESC[2J = clear screen, a classic injection payload.
    const hostile = `before\x1b[2Jafter`;
    expect(stripTerminalEscapes(hostile)).toBe('beforeafter');
  });

  it('strips SGR color sequences', () => {
    // ESC[31m = red foreground, ESC[0m = reset.
    expect(stripTerminalEscapes('\x1b[31mFAIL\x1b[0m')).toBe('FAIL');
  });

  it('strips an OSC window-title sequence terminated by BEL', () => {
    // ESC]0;<title>BEL
    const hostile = `\x1b]0;hijack\x07ok`;
    expect(stripTerminalEscapes(hostile)).toBe('ok');
  });

  it('strips an OSC sequence terminated by ST (ESC\\)', () => {
    const hostile = `\x1b]8;;https://evil.example/\x1b\\link\x1b]8;;\x1b\\`;
    expect(stripTerminalEscapes(hostile)).toBe('link');
  });

  it('strips simple two-byte escapes (ESC + char)', () => {
    // ESC 7 = save cursor, ESC c = full reset.
    expect(stripTerminalEscapes('a\x1b7b\x1bcc')).toBe('abc');
  });

  it('strips C1 control codes (0x80-0x9F)', () => {
    expect(stripTerminalEscapes('a\x9bb')).toBe('ab');
  });

  it('strips raw control characters (BEL, BS) but keeps tab/newline', () => {
    expect(stripTerminalEscapes('a\x07\x08b\tc\nd')).toBe('ab\tc\nd');
  });

  it('strips DEL (0x7F)', () => {
    expect(stripTerminalEscapes('a\x7fb')).toBe('ab');
  });

  it('handles a chain of multiple sequence types', () => {
    const hostile = `\x1b[2J\x1b]0;t\x07\x1b[31mError:\x1b[0m \x07file.md`;
    expect(stripTerminalEscapes(hostile)).toBe('Error: file.md');
  });

  it('is a no-op when no escape sequences are present', () => {
    const safe = 'Diagnostic at line 5: heading-anchor-detected';
    expect(stripTerminalEscapes(safe)).toBe(safe);
  });
});

describe('sanitizeForSingleLine', () => {
  it('collapses newlines into single spaces', () => {
    expect(sanitizeForSingleLine('line one\nline two')).toBe('line one line two');
  });

  it('collapses runs of newlines/CRs into a single space', () => {
    expect(sanitizeForSingleLine('a\r\n\r\nb')).toBe('a b');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeForSingleLine('  text  ')).toBe('text');
  });

  it('combines escape stripping with newline collapsing', () => {
    expect(sanitizeForSingleLine('\x1b[31mline1\x1b[0m\nline2')).toBe('line1 line2');
  });

  it('returns empty string for input that was entirely escape sequences', () => {
    expect(sanitizeForSingleLine('\x1b[2J\x1b[H')).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { parseSnippetLine } from './snippet-line.js';

describe('parseSnippetLine', () => {
  it('returns null for non-snippet lines', () => {
    expect(parseSnippetLine('plain text')).toBeNull();
    expect(parseSnippetLine('--8<--')).toBeNull(); // bare marker, no path on same line
    expect(parseSnippetLine('--8<-- foo.md')).toBeNull(); // unquoted
    expect(parseSnippetLine('')).toBeNull();
  });

  it('parses an inline snippet with a quoted path', () => {
    expect(parseSnippetLine('--8<-- "partials/intro.md"')).toEqual({
      kind: 'inline',
      path: 'partials/intro.md',
      indent: 0,
      lineRanges: null,
      section: null,
      skipped: false,
    });
  });

  it('parses a snippet with leading indent', () => {
    expect(parseSnippetLine('    --8<-- "partials/intro.md"')).toMatchObject({
      indent: 4,
      path: 'partials/intro.md',
    });
  });

  it('accepts arbitrary scissor lengths (-8<-, ----8<-----)', () => {
    expect(parseSnippetLine('-8<- "a.md"')).toMatchObject({ path: 'a.md' });
    expect(parseSnippetLine('-----8<-------- "b.md"')).toMatchObject({ path: 'b.md' });
  });

  it('parses a single-line range as :start', () => {
    expect(parseSnippetLine('--8<-- "file.md:3"')).toMatchObject({
      path: 'file.md',
      lineRanges: [{ start: 3, end: null }],
    });
  });

  it('parses :start:end ranges', () => {
    expect(parseSnippetLine('--8<-- "file.md:4:6"')).toMatchObject({
      path: 'file.md',
      lineRanges: [{ start: 4, end: 6 }],
    });
  });

  it('parses end-only range as ::end', () => {
    expect(parseSnippetLine('--8<-- "file.md::3"')).toMatchObject({
      path: 'file.md',
      lineRanges: [{ start: null, end: 3 }],
    });
  });

  it('parses comma-separated multi-range', () => {
    expect(parseSnippetLine('--8<-- "file.md:1:3,5:6"')).toMatchObject({
      path: 'file.md',
      lineRanges: [
        { start: 1, end: 3 },
        { start: 5, end: 6 },
      ],
    });
  });

  it('parses negative line indexes', () => {
    expect(parseSnippetLine('--8<-- "file.md:-3:-1"')).toMatchObject({
      path: 'file.md',
      lineRanges: [{ start: -3, end: -1 }],
    });
  });

  it('parses a section name', () => {
    expect(parseSnippetLine('--8<-- "file.md:section_name"')).toMatchObject({
      path: 'file.md',
      section: 'section_name',
      lineRanges: null,
    });
  });

  it('marks the skipped flag when path is prefixed with ;', () => {
    expect(parseSnippetLine('--8<-- ";file.md"')).toMatchObject({
      path: 'file.md',
      skipped: true,
    });
  });

  it('rejects empty quoted path', () => {
    expect(parseSnippetLine('--8<-- ""')).toBeNull();
  });

  it('does not match scissors at the start of a longer string of dashes', () => {
    expect(parseSnippetLine('---8<--- alone')).toBeNull(); // no quote
  });
});

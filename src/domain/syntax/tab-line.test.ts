import { describe, expect, it } from 'vitest';
import { parseTabLine } from './tab-line.js';

describe('parseTabLine', () => {
  it('returns null for non-tab lines', () => {
    expect(parseTabLine('plain paragraph')).toBeNull();
    expect(parseTabLine('==')).toBeNull();
    expect(parseTabLine('====')).toBeNull();
    expect(parseTabLine('=== nope')).toBeNull(); // no quotes
    expect(parseTabLine('')).toBeNull();
  });

  it('parses === "Title"', () => {
    expect(parseTabLine('=== "Tab One"')).toEqual({
      marker: '===',
      title: 'Tab One',
      exclusive: false,
      indent: 0,
    });
  });

  it('records the leading indent', () => {
    expect(parseTabLine('    === "Nested Tab"')).toMatchObject({
      indent: 4,
      title: 'Nested Tab',
    });
  });

  it('preserves embedded markdown in title verbatim', () => {
    expect(parseTabLine('=== "Use **npm** install"')).toMatchObject({
      title: 'Use **npm** install',
    });
  });

  it('parses ===! as the exclusive variant', () => {
    expect(parseTabLine('===! "Choose one"')).toEqual({
      marker: '===!',
      title: 'Choose one',
      exclusive: true,
      indent: 0,
    });
  });

  it('rejects empty title', () => {
    expect(parseTabLine('=== ""')).toBeNull();
  });

  it('rejects unquoted title', () => {
    expect(parseTabLine('=== Foo')).toBeNull();
  });
});

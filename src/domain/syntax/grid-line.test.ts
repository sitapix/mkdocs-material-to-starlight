import { describe, expect, it } from 'vitest';
import { parseGridOpenLine, isGridCloseLine } from './grid-line.js';

describe('parseGridOpenLine', () => {
  it('returns null for non-grid lines', () => {
    expect(parseGridOpenLine('plain text')).toBeNull();
    expect(parseGridOpenLine('<div>')).toBeNull();
    expect(parseGridOpenLine('<div class="other">')).toBeNull();
  });

  it('recognizes a card-grid opener', () => {
    expect(parseGridOpenLine('<div class="grid cards" markdown>')).toEqual({
      kind: 'cards',
      indent: 0,
    });
  });

  it('recognizes a generic grid opener', () => {
    expect(parseGridOpenLine('<div class="grid" markdown>')).toEqual({
      kind: 'generic',
      indent: 0,
    });
  });

  it('accepts the markdown attribute in either order or quoted', () => {
    expect(parseGridOpenLine('<div markdown class="grid cards">')).toMatchObject({
      kind: 'cards',
    });
    expect(parseGridOpenLine('<div class="grid cards" markdown="1">')).toMatchObject({
      kind: 'cards',
    });
  });

  it('records leading indent', () => {
    expect(parseGridOpenLine('    <div class="grid cards" markdown>')).toEqual({
      kind: 'cards',
      indent: 4,
    });
  });

  it('does not match grid openers without the markdown attribute', () => {
    expect(parseGridOpenLine('<div class="grid cards">')).toBeNull();
  });
});

describe('isGridCloseLine', () => {
  it('matches a closing div tag', () => {
    expect(isGridCloseLine('</div>')).toBe(true);
    expect(isGridCloseLine('  </div>  ')).toBe(true);
    expect(isGridCloseLine('</div >')).toBe(true);
  });

  it('rejects non-closing lines', () => {
    expect(isGridCloseLine('</div> trailing')).toBe(false);
    expect(isGridCloseLine('plain text')).toBe(false);
    expect(isGridCloseLine('<div>')).toBe(false);
  });
});

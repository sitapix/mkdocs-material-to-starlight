import { describe, expect, it } from 'vitest';
import { readIndentedBlock } from './indented-block.js';

describe('readIndentedBlock', () => {
  it('reads contiguous body lines and leaves trailing blanks for the outer parser', () => {
    const lines = ['!!! note', '    line one', '    line two', '', 'next paragraph'];
    const block = readIndentedBlock(lines, 1, 4);
    expect(block).toEqual({
      bodyLines: ['line one', 'line two'],
      nextIndex: 3,
    });
  });

  it('preserves blank lines inside the block (Material allows this)', () => {
    const lines = ['!!! note', '    paragraph one', '', '    paragraph two', 'outside'];
    const block = readIndentedBlock(lines, 1, 4);
    expect(block.bodyLines).toEqual(['paragraph one', '', 'paragraph two']);
    expect(block.nextIndex).toBe(4);
  });

  it('stops at a non-blank line that is less indented than the threshold', () => {
    const lines = ['!!! note', '    body', '   underindented', '    not reached'];
    const block = readIndentedBlock(lines, 1, 4);
    expect(block.bodyLines).toEqual(['body']);
    expect(block.nextIndex).toBe(2);
  });

  it('preserves additional indentation beyond the threshold', () => {
    const lines = ['!!! note', '    outer', '        nested under outer', '    back to outer'];
    const block = readIndentedBlock(lines, 1, 4);
    expect(block.bodyLines).toEqual(['outer', '    nested under outer', 'back to outer']);
    expect(block.nextIndex).toBe(4);
  });

  it('handles a block with no body (zero-length)', () => {
    const lines = ['!!! note', 'next paragraph'];
    const block = readIndentedBlock(lines, 1, 4);
    expect(block.bodyLines).toEqual([]);
    expect(block.nextIndex).toBe(1);
  });

  it('handles a block at end of input without a trailing line', () => {
    const lines = ['!!! note', '    body'];
    const block = readIndentedBlock(lines, 1, 4);
    expect(block.bodyLines).toEqual(['body']);
    expect(block.nextIndex).toBe(2);
  });

  it('drops trailing blanks from bodyLines and leaves them for the outer parser', () => {
    const lines = ['!!! note', '    body', '', '', 'paragraph after'];
    const block = readIndentedBlock(lines, 1, 4);
    expect(block.bodyLines).toEqual(['body']);
    expect(block.nextIndex).toBe(2);
  });
});

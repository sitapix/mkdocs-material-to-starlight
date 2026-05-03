import { describe, expect, it } from 'vitest';
import { parseBlocksLine } from './blocks-line.js';

describe('parseBlocksLine', () => {
  it('returns null for non-block lines', () => {
    expect(parseBlocksLine('regular paragraph')).toBeNull();
    expect(parseBlocksLine('')).toBeNull();
    expect(parseBlocksLine('//')).toBeNull();
    expect(parseBlocksLine('// comment')).toBeNull();
  });

  it('parses a bare /// note opening', () => {
    expect(parseBlocksLine('/// note')).toEqual({
      kind: 'open',
      name: 'note',
      title: null,
      fenceLength: 3,
      indent: 0,
    });
  });

  it('parses an opening with a pipe-delimited title', () => {
    expect(parseBlocksLine('/// note | My Title')).toEqual({
      kind: 'open',
      name: 'note',
      title: 'My Title',
      fenceLength: 3,
      indent: 0,
    });
  });

  it('parses a bare closing fence', () => {
    expect(parseBlocksLine('///')).toEqual({
      kind: 'close',
      fenceLength: 3,
      indent: 0,
    });
  });

  it('records fence length for 4+ slash openers and closers', () => {
    expect(parseBlocksLine('//// note')).toMatchObject({
      kind: 'open',
      name: 'note',
      fenceLength: 4,
    });
    expect(parseBlocksLine('//////')).toMatchObject({
      kind: 'close',
      fenceLength: 6,
    });
  });

  it('records leading indent for nested blocks', () => {
    expect(parseBlocksLine('    /// tip')).toMatchObject({
      kind: 'open',
      name: 'tip',
      indent: 4,
    });
    expect(parseBlocksLine('        ///')).toMatchObject({
      kind: 'close',
      indent: 8,
    });
  });

  it('rejects an opening with no name', () => {
    expect(parseBlocksLine('/// ')).toEqual({
      kind: 'close',
      fenceLength: 3,
      indent: 0,
    });
  });

  it('preserves embedded markdown inside the title verbatim', () => {
    expect(parseBlocksLine('/// info | Run **npm** install')).toMatchObject({
      kind: 'open',
      name: 'info',
      title: 'Run **npm** install',
    });
  });

  it('rejects fewer than 3 slashes', () => {
    expect(parseBlocksLine('// note')).toBeNull();
    expect(parseBlocksLine('//')).toBeNull();
  });

  it('parses the admonition shortcut name and other built-ins', () => {
    for (const name of ['admonition', 'details', 'tab', 'define', 'caption', 'html']) {
      expect(parseBlocksLine(`/// ${name}`)).toMatchObject({
        kind: 'open',
        name,
      });
    }
  });
});

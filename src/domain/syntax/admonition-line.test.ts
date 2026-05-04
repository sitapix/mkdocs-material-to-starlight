import { describe, expect, it } from 'vitest';
import { parseAdmonitionLine } from './admonition-line.js';

describe('parseAdmonitionLine', () => {
  it('returns null for non-admonition lines', () => {
    expect(parseAdmonitionLine('regular paragraph')).toBeNull();
    expect(parseAdmonitionLine('# heading')).toBeNull();
    expect(parseAdmonitionLine('')).toBeNull();
    expect(parseAdmonitionLine('!!')).toBeNull();
    expect(parseAdmonitionLine('!!!!')).toBeNull();
  });

  it('parses a bare !!! type opening', () => {
    expect(parseAdmonitionLine('!!! note')).toEqual({
      marker: '!!!',
      type: 'note',
      title: null,
      hasEmptyTitle: false,
      inline: null,
      indent: 0,
    });
  });

  it('parses ??? as collapsible-closed', () => {
    expect(parseAdmonitionLine('??? warning')).toMatchObject({
      marker: '???',
      type: 'warning',
    });
  });

  it('parses ???+ as collapsible-open', () => {
    expect(parseAdmonitionLine('???+ tip')).toMatchObject({
      marker: '???+',
      type: 'tip',
    });
  });

  it('extracts a quoted title', () => {
    expect(parseAdmonitionLine('!!! note "My Title"')).toMatchObject({
      type: 'note',
      title: 'My Title',
      hasEmptyTitle: false,
    });
  });

  it('handles an empty quoted title (Material strips icon when present)', () => {
    expect(parseAdmonitionLine('!!! note ""')).toMatchObject({
      type: 'note',
      title: null,
      hasEmptyTitle: true,
    });
  });

  it('preserves embedded markdown inside the title verbatim', () => {
    expect(parseAdmonitionLine('!!! info "Run **npm** install"')).toMatchObject({
      title: 'Run **npm** install',
    });
  });

  it('parses inline modifier (left)', () => {
    expect(parseAdmonitionLine('!!! info inline "Side note"')).toMatchObject({
      type: 'info',
      title: 'Side note',
      inline: 'left',
    });
  });

  it('parses inline end modifier (right)', () => {
    expect(parseAdmonitionLine('!!! info inline end "Side note"')).toMatchObject({
      type: 'info',
      title: 'Side note',
      inline: 'end',
    });
  });

  it('records leading indent for nested admonitions', () => {
    expect(parseAdmonitionLine('    !!! tip')).toMatchObject({
      indent: 4,
      type: 'tip',
    });
    expect(parseAdmonitionLine('        ??? warning "Nested"')).toMatchObject({
      indent: 8,
      type: 'warning',
      title: 'Nested',
    });
  });

  it('rejects an admonition line whose type qualifier is missing', () => {
    expect(parseAdmonitionLine('!!!')).toBeNull();
    expect(parseAdmonitionLine('!!! ')).toBeNull();
  });

  it('does not mistake a quoted-string-containing paragraph for an admonition', () => {
    expect(parseAdmonitionLine('foo "bar"')).toBeNull();
  });

  it('parses an unquoted title (lenient — Material expects quotes but real-world content drops them)', () => {
    // Real-world example from pydantic: `!!! warning Polymorphic serialization of standard library dataclasses`
    const out = parseAdmonitionLine('!!! warning Polymorphic serialization of standard library dataclasses');
    expect(out).not.toBeNull();
    expect(out?.type).toBe('warning');
    expect(out?.title).toBe('Polymorphic serialization of standard library dataclasses');
  });

  it('parses a dash-prefixed unquoted title (real-world aws-nuke shape)', () => {
    // Real-world example: `!!! warning - Cloud Control API - Alternative Resource`
    const out = parseAdmonitionLine('!!! warning - Cloud Control API - Alternative Resource');
    expect(out).not.toBeNull();
    expect(out?.type).toBe('warning');
    // Leading dash + space stripped; remaining text becomes the title
    expect(out?.title).toBe('Cloud Control API - Alternative Resource');
  });

  it('parses an admonition with embedded quotes inside the title (greedy match)', () => {
    // Real-world example from pydantic: `!!! note "on the "jsonable" nature of JSON schema"`
    const out = parseAdmonitionLine('!!! note "on the "jsonable" nature of JSON schema"');
    expect(out).not.toBeNull();
    expect(out?.type).toBe('note');
    // Title is the full text between the first and last quote
    expect(out?.title).toBe('on the "jsonable" nature of JSON schema');
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeDefinitionLists } from './deflists.js';

describe('normalizeDefinitionLists', () => {
  it('passes through text containing no definition lists', () => {
    const src = '# Heading\n\nA plain paragraph.\n\n- list item\n';
    expect(normalizeDefinitionLists(src)).toBe(src);
  });

  it('rewrites a single term + single definition into a <dl> block', () => {
    const src = 'Apple\n:   A red fruit.\n';
    expect(normalizeDefinitionLists(src)).toBe(
      '<dl>\n<dt>Apple</dt>\n<dd>A red fruit.</dd>\n</dl>\n',
    );
  });

  it('groups multiple sibling terms (separated by blank lines) into one <dl>', () => {
    const src = [
      'Apple',
      ':   A red fruit.',
      '',
      'Banana',
      ':   A yellow fruit.',
      '',
    ].join('\n');
    expect(normalizeDefinitionLists(src)).toBe(
      '<dl>\n<dt>Apple</dt>\n<dd>A red fruit.</dd>\n<dt>Banana</dt>\n<dd>A yellow fruit.</dd>\n</dl>\n',
    );
  });

  it('attaches multiple definitions for the same term', () => {
    const src = [
      'Apple',
      ':   A red fruit.',
      ':   A tech company.',
      '',
    ].join('\n');
    expect(normalizeDefinitionLists(src)).toBe(
      '<dl>\n<dt>Apple</dt>\n<dd>A red fruit.</dd>\n<dd>A tech company.</dd>\n</dl>\n',
    );
  });

  it('preserves prose before and after the definition list', () => {
    const src = [
      '# Heading',
      '',
      'Apple',
      ':   Red fruit.',
      '',
      'Trailing paragraph.',
      '',
    ].join('\n');
    const out = normalizeDefinitionLists(src);
    expect(out).toContain('# Heading');
    expect(out).toContain('<dl>');
    expect(out).toContain('<dt>Apple</dt>');
    expect(out).toContain('<dd>Red fruit.</dd>');
    expect(out).toContain('</dl>');
    expect(out).toContain('Trailing paragraph.');
    expect(out).not.toContain(':   Red fruit.');
  });

  it('does not rewrite definition markers inside fenced code', () => {
    const src = [
      '```',
      'Term',
      ':   Definition.',
      '```',
      '',
    ].join('\n');
    expect(normalizeDefinitionLists(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = 'Apple\n:   A red fruit.\n';
    const once = normalizeDefinitionLists(src);
    expect(normalizeDefinitionLists(once)).toBe(once);
  });

  it('does not treat a heading-then-paragraph as a definition list', () => {
    const src = '## Heading\n\nA paragraph follows.\n';
    expect(normalizeDefinitionLists(src)).toBe(src);
  });

  it('does not treat a list item starting with : as a definition', () => {
    const src = '- item\n- :colon-prefixed but not a deflist\n';
    expect(normalizeDefinitionLists(src)).toBe(src);
  });
});

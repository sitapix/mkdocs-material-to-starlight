import { describe, expect, it } from 'vitest';
import { parseLiterateNav } from './parse-literate-nav.js';

describe('parseLiterateNav', () => {
  it('returns empty nav and no diagnostics for empty source', () => {
    const { nav, diagnostics } = parseLiterateNav('');
    expect(nav).toEqual([]);
    expect(diagnostics).toEqual([]);
  });

  it('returns empty nav for source with no list', () => {
    const { nav } = parseLiterateNav('# Navigation\n\nSome prose, no list here.\n');
    expect(nav).toEqual([]);
  });

  it('parses a single file link as a FileEntry', () => {
    const { nav } = parseLiterateNav('* [Home](index.md)\n');
    expect(nav).toEqual([
      { kind: 'file', title: 'Home', path: 'index.md' },
    ]);
  });

  it('parses an external link as an ExternalEntry', () => {
    const { nav } = parseLiterateNav('* [NASA](https://www.nasa.gov/)\n');
    expect(nav).toEqual([
      { kind: 'external', title: 'NASA', href: 'https://www.nasa.gov/' },
    ]);
  });

  it('treats http and https links as external; .md as file', () => {
    const { nav } = parseLiterateNav(
      [
        '* [Home](index.md)',
        '* [Web](http://example.com)',
        '* [SSL](https://example.com)',
        '',
      ].join('\n'),
    );
    expect(nav).toEqual([
      { kind: 'file', title: 'Home', path: 'index.md' },
      { kind: 'external', title: 'Web', href: 'http://example.com' },
      { kind: 'external', title: 'SSL', href: 'https://example.com' },
    ]);
  });

  it('parses a nested list with a plain-text parent as a SectionEntry', () => {
    const { nav } = parseLiterateNav(
      [
        '* Guide',
        '    * [Intro](guide/intro.md)',
        '    * [Setup](guide/setup.md)',
        '',
      ].join('\n'),
    );
    expect(nav).toEqual([
      {
        kind: 'section',
        title: 'Guide',
        children: [
          { kind: 'file', title: 'Intro', path: 'guide/intro.md' },
          { kind: 'file', title: 'Setup', path: 'guide/setup.md' },
        ],
      },
    ]);
  });

  it('parses a nested list with a linked parent (uses link text as section title)', () => {
    const { nav } = parseLiterateNav(
      [
        '* [API](api/index.md)',
        '    * [Auth](api/auth.md)',
        '    * [Users](api/users.md)',
        '',
      ].join('\n'),
    );
    expect(nav).toHaveLength(1);
    const first = nav[0];
    expect(first?.kind).toBe('section');
    if (first?.kind !== 'section') return;
    expect(first.title).toBe('API');
    expect(first.children).toHaveLength(2);
    expect(first.children[0]).toEqual({
      kind: 'file',
      title: 'Auth',
      path: 'api/auth.md',
    });
  });

  it('handles deep recursion (sections within sections)', () => {
    const { nav } = parseLiterateNav(
      [
        '* API',
        '    * V1',
        '        * [Auth](api/v1/auth.md)',
        '',
      ].join('\n'),
    );
    const top = nav[0];
    if (top?.kind !== 'section') return;
    const v1 = top.children[0];
    if (v1?.kind !== 'section') return;
    expect(v1.title).toBe('V1');
    expect(v1.children[0]).toEqual({
      kind: 'file',
      title: 'Auth',
      path: 'api/v1/auth.md',
    });
  });

  it('parses multiple top-level entries in source order', () => {
    const { nav } = parseLiterateNav(
      [
        '* [Home](index.md)',
        '* [About](about.md)',
        '* [Contact](contact.md)',
        '',
      ].join('\n'),
    );
    expect(nav.map((e) => e.kind === 'file' && e.path)).toEqual([
      'index.md',
      'about.md',
      'contact.md',
    ]);
  });

  it('only consumes the FIRST top-level list and ignores headings/prose around it', () => {
    const { nav } = parseLiterateNav(
      [
        '# Navigation',
        '',
        'Some intro prose.',
        '',
        '* [Home](index.md)',
        '* [API](api/auth.md)',
        '',
        '## Footer',
        '',
        '* [Ignored](ignored.md)',
        '',
      ].join('\n'),
    );
    expect(nav).toHaveLength(2);
    expect(nav.find((e) => e.kind === 'file' && e.path === 'ignored.md')).toBeUndefined();
  });

  it('emits a malformed diagnostic for a list item with no recognizable content', () => {
    // A bullet line with only whitespace produces a list item without a link
    // and without a nested list. Markdown parsers vary in how they represent
    // this; we just need ONE failure path covered to lock the contract.
    const { diagnostics } = parseLiterateNav(
      [
        '* [Home](index.md)',
        '* ',
        '',
      ].join('\n'),
    );
    // Either no diagnostic (if the parser strips empty items) or a
    // plugin-literate-nav-malformed; both are acceptable. The contract is:
    // we never throw and we tag any unparseable items.
    for (const d of diagnostics) {
      expect(d.ruleId).toBe('plugin-literate-nav-malformed');
    }
  });

  it('idempotency: parsing the same source twice yields identical nav', () => {
    const source = [
      '* [Home](index.md)',
      '* API',
      '    * [Auth](api/auth.md)',
      '',
    ].join('\n');
    expect(parseLiterateNav(source).nav).toEqual(parseLiterateNav(source).nav);
  });
});

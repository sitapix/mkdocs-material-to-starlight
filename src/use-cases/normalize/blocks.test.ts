import { describe, expect, it } from 'vitest';
import { ADMONITION_FENCE_DEPTH } from './admonitions.js';
import { normalizeBlocks } from './blocks.js';

const F = ':'.repeat(ADMONITION_FENCE_DEPTH);

describe('normalizeBlocks', () => {
  it('passes through text containing no blocks fences', () => {
    const src = '# Heading\n\nA plain paragraph.\n\n- list item\n';
    expect(normalizeBlocks(src)).toBe(src);
  });

  it('rewrites a bare /// note block into an admonition directive', () => {
    const src = '/// note\nBody line one.\nBody line two.\n///\n\nAfter.\n';
    const expected = `${F}note\nBody line one.\nBody line two.\n${F}\n\nAfter.\n`;
    expect(normalizeBlocks(src)).toBe(expected);
  });

  it('preserves a pipe-delimited title with bracketed-attribute syntax', () => {
    const src = '/// warning | Heads up\nRead this.\n///\n';
    expect(normalizeBlocks(src)).toBe(`${F}warning[Heads up]\nRead this.\n${F}\n`);
  });

  it('rewrites multiple sibling blocks independently', () => {
    const src = '/// note\nFirst.\n///\n\n/// warning\nSecond.\n///\n';
    expect(normalizeBlocks(src)).toBe(`${F}note\nFirst.\n${F}\n\n${F}warning\nSecond.\n${F}\n`);
  });

  it('does not touch lines inside fenced code blocks', () => {
    const src = ['```', '/// note', 'body', '///', '```', ''].join('\n');
    expect(normalizeBlocks(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = '/// note | Title\nBody.\n///\n';
    const once = normalizeBlocks(src);
    const twice = normalizeBlocks(once);
    expect(twice).toBe(once);
  });

  it('matches closer to opener by fence length, allowing nested 3-slash inside 4-slash', () => {
    // The fence-length matching in the normalizer's OWN tokenizer is the
    // load-bearing behavior under test — the inner 3-slash close must NOT be
    // mistaken for the outer 4-slash close. The outer block grows ONE COLON
    // above the inner so remark-directive's closing rule (a closer of M
    // colons terminates any open container with depth ≤ M) doesn't let the
    // inner closer prematurely terminate the outer.
    const src = ['//// admonition | Outer', '/// note', 'inner body', '///', '////', ''].join('\n');
    const OUTER = ':'.repeat(ADMONITION_FENCE_DEPTH + 1);
    const expected = [`${OUTER}note[Outer]`, `${F}note`, 'inner body', F, OUTER, ''].join('\n');
    expect(normalizeBlocks(src)).toBe(expected);
  });

  it('grows fence depth for each level of block nesting', () => {
    // Triple-nested admonition blocks: leaf at base depth, each enclosing
    // block adds one colon so the closing sequence unwinds inside-out.
    const src = [
      '///// admonition | Outermost',
      '//// admonition | Middle',
      '/// admonition | Inner',
      'innermost body',
      '///',
      '////',
      '/////',
      '',
    ].join('\n');
    const D6 = ':'.repeat(ADMONITION_FENCE_DEPTH);
    const D7 = ':'.repeat(ADMONITION_FENCE_DEPTH + 1);
    const D8 = ':'.repeat(ADMONITION_FENCE_DEPTH + 2);
    const expected = [
      `${D8}note[Outermost]`,
      `${D7}note[Middle]`,
      `${D6}note[Inner]`,
      'innermost body',
      D6,
      D7,
      D8,
      '',
    ].join('\n');
    expect(normalizeBlocks(src)).toBe(expected);
  });

  it('grows tab and tabs fence depth when a tab body contains a nested block', () => {
    // Real-world fastapi pattern: a `//// tab` wrapping a `/// details`.
    // The tab fence must exceed the details fence; the tabs wrapper must
    // exceed the tab fence; otherwise an inner closer terminates the outer.
    const src = [
      '//// tab | venv',
      'text',
      '/// details | What that command means',
      'inner items',
      '///',
      '////',
      '',
    ].join('\n');
    const D6 = ':'.repeat(ADMONITION_FENCE_DEPTH);
    const D7 = ':'.repeat(ADMONITION_FENCE_DEPTH + 1);
    const D8 = ':'.repeat(ADMONITION_FENCE_DEPTH + 2);
    const expected = [
      `${D8}tabs`,
      `${D7}tab[venv]`,
      'text',
      `${D6}note[What that command means]{collapsible="closed"}`,
      'inner items',
      D6,
      D7,
      D8,
      '',
      '',
    ].join('\n');
    expect(normalizeBlocks(src)).toBe(expected);
  });

  it('leaves an unterminated /// fence untouched so a diagnostic can surface', () => {
    const src = '/// note\nBody but no closer.\n\nMore prose.\n';
    expect(normalizeBlocks(src)).toBe(src);
  });

  it('wraps a single /// tab block in a ::::tabs group', () => {
    const src = '/// tab | C\ncode-c\n///\n';
    const expected = ['::::tabs', ':::tab[C]', 'code-c', ':::', '::::', '', ''].join('\n');
    expect(normalizeBlocks(src)).toBe(expected);
  });

  it('groups consecutive sibling /// tab blocks into one ::::tabs parent', () => {
    const src = ['/// tab | C', 'c-body', '///', '', '/// tab | C++', 'cpp-body', '///', ''].join(
      '\n',
    );
    const expected = [
      '::::tabs',
      ':::tab[C]',
      'c-body',
      ':::',
      ':::tab[C++]',
      'cpp-body',
      ':::',
      '::::',
      '',
      '',
    ].join('\n');
    expect(normalizeBlocks(src)).toBe(expected);
  });

  it('rewrites /// details as a collapsible-closed admonition', () => {
    const src = '/// details | More info\nDetail body.\n///\n';
    expect(normalizeBlocks(src)).toBe(
      `${F}note[More info]{collapsible="closed"}\nDetail body.\n${F}\n`,
    );
  });

  it('wraps a /// caption block in inline <figcaption> HTML', () => {
    const src = '/// caption\nA helpful caption.\n///\n';
    expect(normalizeBlocks(src)).toBe('<figcaption>A helpful caption.</figcaption>\n');
  });

  it('preserves multi-line caption body inside <figcaption>', () => {
    const src = '/// caption\nLine one.\nLine two.\n///\n';
    expect(normalizeBlocks(src)).toBe('<figcaption>Line one.\nLine two.</figcaption>\n');
  });

  it('strips /// define wrapper so the inner deflist passes to normalizeDefinitionLists', () => {
    const src = '/// define\nApple\n:   A red fruit.\n///\n';
    expect(normalizeBlocks(src)).toBe('Apple\n:   A red fruit.\n');
  });

  it('strips /// html wrapper and emits the raw HTML body unchanged', () => {
    const src = '/// html\n<custom-banner>Hi</custom-banner>\n///\n';
    expect(normalizeBlocks(src)).toBe('<custom-banner>Hi</custom-banner>\n');
  });

  it('wraps /// html | div[class=foo] body in the named element with the parsed class', () => {
    const src = '/// html | div[class=foo]\nbody text\n///\n';
    expect(normalizeBlocks(src)).toBe('<div class="foo">\nbody text\n</div>\n');
  });

  it('defaults a bare /// admonition (no type:) to note directive', () => {
    const src = '/// admonition | Heads up\nbody.\n///\n';
    expect(normalizeBlocks(src)).toBe(`${F}note[Heads up]\nbody.\n${F}\n`);
  });

  it('honors a 4-space-indented `type: warning` option as the directive name', () => {
    const src = ['/// admonition | Title', '    type: warning', 'body.', '///', ''].join('\n');
    expect(normalizeBlocks(src)).toBe(`${F}warning[Title]\nbody.\n${F}\n`);
  });

  it('honors a `type: tip` option', () => {
    const src = ['/// admonition | Pro tip', '    type: tip', 'helpful.', '///', ''].join('\n');
    expect(normalizeBlocks(src)).toBe(`${F}tip[Pro tip]\nhelpful.\n${F}\n`);
  });

  it('honors a `type:` option followed by a `---` options-body separator', () => {
    const src = ['/// admonition | Title', '    type: danger', '---', 'body.', '///', ''].join(
      '\n',
    );
    expect(normalizeBlocks(src)).toBe(`${F}danger[Title]\nbody.\n${F}\n`);
  });

  it('rewrites a bare /// details (no title) as a collapsible-closed admonition', () => {
    const src = '/// details\nDetail body.\n///\n';
    expect(normalizeBlocks(src)).toBe(`${F}note{collapsible="closed"}\nDetail body.\n${F}\n`);
  });

  it('terminates a tab group when a non-tab block intervenes', () => {
    const src = [
      '/// tab | C',
      'c-body',
      '///',
      '',
      '/// note',
      'note-body',
      '///',
      '',
      '/// tab | C++',
      'cpp-body',
      '///',
      '',
    ].join('\n');
    const out = normalizeBlocks(src);
    // Two distinct tab groups, with an admonition between them.
    expect(out).toContain(`::::tabs\n:::tab[C]\nc-body\n:::\n::::`);
    expect(out).toContain(`${F}note\nnote-body\n${F}`);
    expect(out).toContain(`::::tabs\n:::tab[C++]\ncpp-body\n:::\n::::`);
  });
});

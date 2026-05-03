import { describe, expect, it } from 'vitest';
import { normalizeHeadingAttrList } from './heading-attr-list.js';

describe('normalizeHeadingAttrList', () => {
  it('passes through plain headings unchanged', () => {
    const input = '# Hello\n\n## World\n\nbody\n';
    expect(normalizeHeadingAttrList(input)).toBe(input);
  });

  it('strips a trailing `{ #anchor-id }` from an ATX heading', () => {
    // Material's attr_list extension lets authors specify heading IDs:
    //   # First Steps { #first-steps }
    // Starlight auto-generates IDs from heading text using a slugger, and has
    // no first-class API for explicit overrides. Stripping the attr_list
    // gives the same auto-generated slug for the common case
    // (`First Steps` → `first-steps`) and avoids the literal `{ #... }`
    // appearing in the rendered title bar.
    const input = '# First Steps { #first-steps }\n';
    expect(normalizeHeadingAttrList(input)).toBe('# First Steps\n');
  });

  it('strips attr_list with multiple tokens (id + class + key=value)', () => {
    const input = '## Check it { #check-it .highlighted data-foo="bar" }\n';
    expect(normalizeHeadingAttrList(input)).toBe('## Check it\n');
  });

  it('preserves ATX heading level (one through six hashes)', () => {
    expect(normalizeHeadingAttrList('### A { #a }\n')).toBe('### A\n');
    expect(normalizeHeadingAttrList('#### B { #b }\n')).toBe('#### B\n');
    expect(normalizeHeadingAttrList('##### C { #c }\n')).toBe('##### C\n');
    expect(normalizeHeadingAttrList('###### D { #d }\n')).toBe('###### D\n');
  });

  it('handles trailing closing-hash style ATX (`# Title { #id } #`)', () => {
    // Some authors close ATX with trailing #s; the attr_list comes before.
    const input = '## Closed { #anchor } ##\n';
    // We strip the attr_list but preserve the heading text and trailing #.
    expect(normalizeHeadingAttrList(input)).toBe('## Closed ##\n');
  });

  it('does not touch a `{ #...}` fragment that is not at the end of a heading', () => {
    // A sentence like `set the id with { #foo }` in body text must not be
    // rewritten — only heading-line trailing attr_lists are stripped.
    const input = 'Body text { #not-a-heading } here.\n';
    expect(normalizeHeadingAttrList(input)).toBe(input);
  });

  it('does not touch `{` inside a fenced code block', () => {
    const input = '```python\n# fake heading { #not-real }\n```\n';
    expect(normalizeHeadingAttrList(input)).toBe(input);
  });

  it('preserves headings without attr_list when other headings have them', () => {
    const input = ['# A { #a }', '', '## B', '', '### C { #c }', ''].join('\n');
    const expected = ['# A', '', '## B', '', '### C', ''].join('\n');
    expect(normalizeHeadingAttrList(input)).toBe(expected);
  });

  it('is idempotent — running it twice produces the same output as once', () => {
    const input = '# Foo { #foo }\n## Bar { #bar }\n';
    const once = normalizeHeadingAttrList(input);
    const twice = normalizeHeadingAttrList(once);
    expect(twice).toBe(once);
  });
});

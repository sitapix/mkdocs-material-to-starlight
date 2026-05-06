import { describe, expect, it } from 'vitest';
import { normalizeWikilinks } from './wikilinks.js';

describe('normalizeWikilinks', () => {
  it('returns input unchanged when no wikilinks are present', () => {
    const src = 'Plain prose with [a regular link](url).\n';
    expect(normalizeWikilinks(src)).toBe(src);
  });

  it('translates a basic wikilink to a markdown link with slugified path', () => {
    const out = normalizeWikilinks('See [[Page Name]] for context.\n');
    expect(out).toContain('[Page Name](/page-name/)');
  });

  it('preserves visible label and slugifies underscores/spaces', () => {
    const out = normalizeWikilinks('[[Hello World]]\n');
    expect(out).toContain('[Hello World](/hello-world/)');
  });

  it('translates multiple wikilinks on the same line', () => {
    const out = normalizeWikilinks('See [[Foo]] and [[Bar]].\n');
    expect(out).toContain('[Foo](/foo/)');
    expect(out).toContain('[Bar](/bar/)');
  });

  it('does not match content inside fenced code blocks', () => {
    const src = '```\n[[Page]]\n```\n';
    expect(normalizeWikilinks(src)).toBe(src);
  });

  it('does not match content inside inline code', () => {
    const src = 'Use the syntax `[[Foo]]` to link.\n';
    expect(normalizeWikilinks(src)).toBe(src);
  });

  it('idempotent: a second pass over translated output is a no-op', () => {
    const src = 'See [[Page Name]].\n';
    const once = normalizeWikilinks(src);
    const twice = normalizeWikilinks(once);
    expect(twice).toBe(once);
  });

  it('lowercases and dash-separates Unicode-stripped labels', () => {
    const out = normalizeWikilinks('[[API Reference]]\n');
    expect(out).toContain('[API Reference](/api-reference/)');
  });

  it('skips empty bracket pairs (`[[]]`)', () => {
    const src = 'Empty: [[]] does nothing.\n';
    expect(normalizeWikilinks(src)).toBe(src);
  });
});

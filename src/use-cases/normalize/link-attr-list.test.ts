import { describe, expect, it } from 'vitest';
import { normalizeLinkAttrLists } from './link-attr-list.js';

describe('normalizeLinkAttrLists', () => {
  it('passes through links without attribute lists', () => {
    const input = 'See [the docs](./docs.md) for more.\n';
    const result = normalizeLinkAttrLists(input);
    expect(result.text).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('strips {.class target=_blank} from an inline link', () => {
    const input = '[link](./other.md){.internal-link target=_blank}\n';
    const result = normalizeLinkAttrLists(input);
    expect(result.text).toBe('[link](./other.md)\n');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.ruleId).toBe('link-attr-list-stripped');
    expect(result.diagnostics[0]?.message).toContain('.internal-link');
  });

  it('strips attr list from a reference-style link', () => {
    const input = '[link][ref]{.class}\n';
    const result = normalizeLinkAttrLists(input);
    expect(result.text).toBe('[link][ref]\n');
    expect(result.diagnostics).toHaveLength(1);
  });

  it('handles multiple attr-list links on the same line', () => {
    const input = '[A](./a.md){.cls} and [B](./b.md){target=_blank}\n';
    const result = normalizeLinkAttrLists(input);
    expect(result.text).toBe('[A](./a.md) and [B](./b.md)\n');
    expect(result.diagnostics).toHaveLength(2);
  });

  it('does not strip attr list inside a fenced code block', () => {
    const input = '```\n[link](./x.md){.cls}\n```\n';
    const result = normalizeLinkAttrLists(input);
    expect(result.text).toBe(input);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('is idempotent', () => {
    const input = '[link](./other.md){.internal-link target=_blank}\n';
    const once = normalizeLinkAttrLists(input);
    const twice = normalizeLinkAttrLists(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.diagnostics).toHaveLength(0);
  });

  it('records the line number in the diagnostic', () => {
    const input = '# Title\n\n[link](./other.md){.cls}\n';
    const result = normalizeLinkAttrLists(input);
    expect(result.diagnostics[0]?.place?.line).toBe(3);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeAdmonitions, ADMONITION_FENCE_DEPTH } from './admonitions.js';

const FENCE = ':'.repeat(ADMONITION_FENCE_DEPTH);

describe('normalizeAdmonitions', () => {
  it('passes through text containing no admonitions', () => {
    const src = '# Heading\n\nA plain paragraph.\n\n- list item\n';
    expect(normalizeAdmonitions(src)).toBe(src);
  });

  it('rewrites a bare !!! note block into a directive with ADMONITION_FENCE_DEPTH colons', () => {
    const src = '!!! note\n    Body line one.\n    Body line two.\n\nAfter.\n';
    const expected = `${FENCE}note\nBody line one.\nBody line two.\n${FENCE}\n\nAfter.\n`;
    expect(normalizeAdmonitions(src)).toBe(expected);
  });

  it('preserves a quoted title with bracketed-attribute syntax', () => {
    const src = '!!! warning "Heads up"\n    Read this.\n';
    expect(normalizeAdmonitions(src)).toBe(
      `${FENCE}warning[Heads up]\nRead this.\n${FENCE}\n`,
    );
  });

  it('translates ??? as a collapsible directive (data-collapsible attribute)', () => {
    const src = '??? tip\n    Hidden by default.\n';
    expect(normalizeAdmonitions(src)).toBe(
      `${FENCE}tip{collapsible="closed"}\nHidden by default.\n${FENCE}\n`,
    );
  });

  it('translates ???+ as a collapsible-open directive', () => {
    const src = '???+ tip\n    Visible by default.\n';
    expect(normalizeAdmonitions(src)).toBe(
      `${FENCE}tip{collapsible="open"}\nVisible by default.\n${FENCE}\n`,
    );
  });

  it('preserves an inline-end modifier in attribute form', () => {
    const src = '!!! info inline end "Aside"\n    Floats right.\n';
    expect(normalizeAdmonitions(src)).toBe(
      `${FENCE}info[Aside]{inline="end"}\nFloats right.\n${FENCE}\n`,
    );
  });

  it('rewrites multiple admonitions in one document independently', () => {
    const src =
      '!!! note\n    First.\n\n!!! warning\n    Second.\n';
    expect(normalizeAdmonitions(src)).toBe(
      `${FENCE}note\nFirst.\n${FENCE}\n\n${FENCE}warning\nSecond.\n${FENCE}\n`,
    );
  });

  it('leaves an admonition with empty body as a marker-only directive', () => {
    const src = '!!! note\n\nNext paragraph.\n';
    expect(normalizeAdmonitions(src)).toBe(
      `${FENCE}note\n${FENCE}\n\nNext paragraph.\n`,
    );
  });

  it('does not touch lines that look like admonitions but are inside fenced code', () => {
    const src = [
      '```',
      '!!! note',
      '    body',
      '```',
      '',
    ].join('\n');
    expect(normalizeAdmonitions(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = '!!! note "Title"\n    Body.\n';
    const once = normalizeAdmonitions(src);
    const twice = normalizeAdmonitions(once);
    expect(twice).toBe(once);
  });

  it('recursively converts an admonition nested inside another admonition body', () => {
    const src = [
      '??? info "Smart Mode Algorithm"',
      '',
      '    Some prose.',
      '',
      '    !!! note',
      '        Inner body.',
      '',
      '    Trailing prose.',
      '',
    ].join('\n');
    // Outer must use one MORE colon than inner — remark-directive closes any
    // open container when it meets a fence with ≥ as many colons. Inner stays
    // at the canonical ADMONITION_FENCE_DEPTH; outer grows to depth+1.
    const OUTER = ':'.repeat(ADMONITION_FENCE_DEPTH + 1);
    const INNER = ':'.repeat(ADMONITION_FENCE_DEPTH);
    const expected = [
      `${OUTER}info[Smart Mode Algorithm]{collapsible="closed"}`,
      '',
      'Some prose.',
      '',
      `${INNER}note`,
      'Inner body.',
      INNER,
      '',
      'Trailing prose.',
      OUTER,
      '',
    ].join('\n');
    expect(normalizeAdmonitions(src)).toBe(expected);
  });

  it('grows fence depth for each level of admonition nesting', () => {
    const src = [
      '!!! warning "outer"',
      '    !!! info "middle"',
      '        !!! note',
      '            innermost',
      '',
    ].join('\n');
    const D6 = ':'.repeat(ADMONITION_FENCE_DEPTH);
    const D7 = ':'.repeat(ADMONITION_FENCE_DEPTH + 1);
    const D8 = ':'.repeat(ADMONITION_FENCE_DEPTH + 2);
    const expected = [
      `${D8}warning[outer]`,
      `${D7}info[middle]`,
      `${D6}note`,
      'innermost',
      D6,
      D7,
      D8,
      '',
    ].join('\n');
    expect(normalizeAdmonitions(src)).toBe(expected);
  });

  it('is idempotent across nesting — running twice equals running once', () => {
    const src = [
      '??? info "Outer"',
      '    !!! note',
      '        Inner.',
      '',
    ].join('\n');
    const once = normalizeAdmonitions(src);
    const twice = normalizeAdmonitions(once);
    expect(twice).toBe(once);
  });

  it('grows fence depth when body contains a /// pymdownx block marker', () => {
    // Real-world pydantic pattern: !!! note wrapping /// version-added.
    // The blocks normalizer (which runs after admonitions) emits the inner
    // /// directive at base depth, so the outer admonition's closer must
    // exceed it — otherwise the inner closer terminates both at parse time.
    const src = [
      '!!! note "Heads up"',
      '    body line',
      '',
      '    /// version-added | v2.10',
      '    ///',
      '',
    ].join('\n');
    const OUTER = ':'.repeat(ADMONITION_FENCE_DEPTH + 1);
    const expected = [
      `${OUTER}note[Heads up]`,
      'body line',
      '',
      '/// version-added | v2.10',
      '///',
      OUTER,
      '',
    ].join('\n');
    expect(normalizeAdmonitions(src)).toBe(expected);
  });

  it('grows fence depth above the deepest /// block nesting in the body', () => {
    // Doubly-nested pymdownx blocks inside an admonition: the outer block
    // will eventually emit at depth (BASE+1), so the admonition needs (BASE+2).
    const src = [
      '!!! warning "Heads up"',
      '    //// admonition | Outer',
      '    /// note',
      '    inner',
      '    ///',
      '    ////',
      '',
    ].join('\n');
    const D8 = ':'.repeat(ADMONITION_FENCE_DEPTH + 2);
    const expected = [
      `${D8}warning[Heads up]`,
      '//// admonition | Outer',
      '/// note',
      'inner',
      '///',
      '////',
      D8,
      '',
    ].join('\n');
    expect(normalizeAdmonitions(src)).toBe(expected);
  });
});

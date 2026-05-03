import { describe, expect, it } from 'vitest';
import { normalizeSmartSymbols } from './smartsymbols.js';

describe('normalizeSmartSymbols', () => {
  it('passes through prose with no smart symbols unchanged', () => {
    const src = 'Just regular text here.\n';
    expect(normalizeSmartSymbols(src)).toBe(src);
  });

  it('rewrites copyright shortcut (c)', () => {
    expect(normalizeSmartSymbols('Acme Corp (c) 2026.\n')).toBe('Acme Corp © 2026.\n');
  });

  it('rewrites registered shortcut (r)', () => {
    expect(normalizeSmartSymbols('Brand (r) is ours.\n')).toBe('Brand ® is ours.\n');
  });

  it('rewrites trademark shortcut (tm)', () => {
    expect(normalizeSmartSymbols('Foo (tm) is ours.\n')).toBe('Foo ™ is ours.\n');
  });

  it('rewrites plus-minus +/-', () => {
    expect(normalizeSmartSymbols('Tolerance is +/-5%.\n')).toBe('Tolerance is ±5%.\n');
  });

  it('rewrites arrows --> <-- <-->', () => {
    expect(normalizeSmartSymbols('Flow A --> B <-- C <--> D.\n')).toBe(
      'Flow A → B ← C ↔ D.\n',
    );
  });

  it('rewrites care-of c/o and not-equal =/=', () => {
    expect(normalizeSmartSymbols('Send c/o Alice. x =/= y.\n')).toBe(
      'Send ℅ Alice. x ≠ y.\n',
    );
  });

  it('rewrites common fractions 1/2 1/4 3/4', () => {
    expect(normalizeSmartSymbols('Take 1/2 cup, then 1/4, then 3/4.\n')).toBe(
      'Take ½ cup, then ¼, then ¾.\n',
    );
  });

  it('does not touch lines inside fenced code blocks', () => {
    const src = ['```', 'see (c) and -->', '```', ''].join('\n');
    expect(normalizeSmartSymbols(src)).toBe(src);
  });

  it('does not touch content inside backtick inline code', () => {
    const src = 'Use `(c)` literally and `-->` too.\n';
    expect(normalizeSmartSymbols(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = 'Acme (c) 2026. Range 1/2 to 3/4. A --> B.\n';
    const once = normalizeSmartSymbols(src);
    expect(normalizeSmartSymbols(once)).toBe(once);
  });

  it('does not rewrite (c) inside a Material annotation marker like (1) — distinct lexical class', () => {
    // Annotations use bare digits (1), (2). Smart symbols use letter mnemonics.
    const src = 'See marker (1) here.\n';
    expect(normalizeSmartSymbols(src)).toBe(src);
  });

  it('does not rewrite arrows inside pymdownx.snippets markers (--8<--)', () => {
    // `<--` inside `--8<--` is flush against digits/dashes — must NOT be
    // mistaken for a smart-symbol arrow. The snippet expander runs separately.
    const src = '--8<-- "intro.md"\n--8<--\nfoo.md\n--8<--\n';
    expect(normalizeSmartSymbols(src)).toBe(src);
  });

  it('does not rewrite arrows inside Markdown HR-like sequences (---)', () => {
    const src = '---\n';
    expect(normalizeSmartSymbols(src)).toBe(src);
  });
});

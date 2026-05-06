import { describe, expect, it } from 'vitest';
import { normalizeAttrList } from './attr-list.js';

describe('normalizeAttrList', () => {
  it('strips `{ scope=\'col\' }` from a markdown table header (Ruff rules.md)', () => {
    // Real-world: Ruff `rules.md` writes
    //   `| Code { scope='col' } | Name { scope='col' } | … |`
    // PyMdown's attr_list extension would attach the `scope` attribute to
    // each `<th>`. Astro/Starlight has no such hook, so the literal `{ ... }`
    // bleeds into the rendered table header. Strip universally.
    const src = "| Code { scope='col' } | Name { scope='col' } |\n";
    const out = normalizeAttrList(src);
    expect(out).toBe('| Code  | Name  |\n');
  });

  it('preserves `{ ... }` brace pairs inside `$$ … $$` block math', () => {
    // Real-world: arithmatex math expressions like `\sum_{k=0}^{\infty}`
    // contain brace pairs that look like attr_lists (`{k=0}`) but are
    // actually subscript/argument groups. Math must round-trip verbatim.
    const src = '$$\n\\cos x = \\sum_{k=0}^{\\infty} \\frac{(-1)^k}{(2k)!} x^{2k}\n$$\n';
    const out = normalizeAttrList(src);
    expect(out).toBe(src);
  });

  it('preserves `{ ... }` brace pairs inside `$ … $` inline math', () => {
    const src = 'Inline $a_{1,2}$ between text.\n';
    const out = normalizeAttrList(src);
    expect(out).toBe(src);
  });

  it('preserves remark block-directive attrs `:::note[label]{collapsible="closed"}`', () => {
    // Earlier normalizers (e.g. pymdownx.blocks.details) emit this shape;
    // downstream stages need the attrs to drive <details> rendering.
    const src = ':::note[Click for more]{collapsible="closed"}\nHidden body.\n:::\n';
    const out = normalizeAttrList(src);
    expect(out).toBe(src);
  });

  it('still strips `{ .lg .middle }` from a text directive `:icon[clock]{ .lg .middle }`', () => {
    // Material text-level icon shortcode + PyMdown attr_list. NOT a block
    // directive (single `:` not `:::`), so the attrs are PyMdown noise we
    // drop. Discriminator: no `:::name` earlier on the line.
    const src = 'See :icon[clock]{ .lg .middle } here.\n';
    const out = normalizeAttrList(src);
    expect(out).toBe('See :icon[clock] here.\n');
  });

  it('is idempotent', () => {
    const src = "| Code { scope='col' } | Name { .sr-only } |\n";
    const once = normalizeAttrList(src);
    const twice = normalizeAttrList(once);
    expect(twice).toBe(once);
  });
});

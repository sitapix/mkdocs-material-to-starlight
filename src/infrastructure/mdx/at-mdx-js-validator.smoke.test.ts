/**
 * Smoke test for the MDX validator adapter.
 *
 * Only validates the .md path (which always works) and the driver-missing
 * branch (which always works). The .mdx path is exercised by integration
 * tests when @mdx-js/mdx happens to be installed in the test environment.
 */
import { describe, expect, it } from 'vitest';
import { createMdxOutputValidator } from './at-mdx-js-validator.js';

describe('createMdxOutputValidator', () => {
  it('reports ok for valid Markdown', async () => {
    const v = createMdxOutputValidator();
    const result = await v.validate('# Hello\n\nA paragraph.\n', 'md');
    expect(result.kind).toBe('ok');
  });

  it('reports ok for a markdown file with frontmatter, gfm tables, and directives', async () => {
    const v = createMdxOutputValidator();
    const text = [
      '---',
      'title: x',
      '---',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      ':::note',
      'body',
      ':::',
      '',
    ].join('\n');
    const result = await v.validate(text, 'md');
    expect(result.kind).toBe('ok');
  });

  it('returns driver-missing OR ok for .mdx depending on @mdx-js/mdx availability', async () => {
    const v = createMdxOutputValidator();
    const result = await v.validate('# Hello\n', 'mdx');
    // Either outcome is acceptable in CI; we just verify the contract.
    expect(['ok', 'driver-missing']).toContain(result.kind);
    if (result.kind === 'driver-missing') {
      expect(result.hint).toContain('@mdx-js/mdx');
    }
  });

  describe('mdx pipeline matches Starlight (skips when @mdx-js/mdx absent)', () => {
    // These cases reproduce real-world mkdocs-material output that the bare
    // `mdx.compile()` call (no remark plugins) rejects. Starlight's actual
    // pipeline accepts them via remark-directive, remark-math, and remark-gfm,
    // so the validator must mirror that to avoid false-positive errors.

    it('accepts a `:::note[label]{key="val"}` container directive', async () => {
      const v = createMdxOutputValidator();
      const text = ':::note[Lorem ipsum]{inline="end" icon="information"}\nbody\n:::\n';
      const result = await v.validate(text, 'mdx');
      if (result.kind === 'driver-missing') return;
      expect(result.kind).toBe('ok');
    });

    it('accepts a `:icon[name]{ .class }` text directive with attribute list', async () => {
      const v = createMdxOutputValidator();
      const text = 'Inline :icon[youtube]{ .youtube } here.\n';
      const result = await v.validate(text, 'mdx');
      if (result.kind === 'driver-missing') return;
      expect(result.kind).toBe('ok');
    });

    it('accepts a `$$ ... $$` math block with LaTeX braces', async () => {
      const v = createMdxOutputValidator();
      const text = '$$\n\\cos x=\\sum_{k=0}^{\\infty}\\frac{(-1)^k}{(2k)!}x^{2k}\n$$\n';
      const result = await v.validate(text, 'mdx');
      if (result.kind === 'driver-missing') return;
      expect(result.kind).toBe('ok');
    });

    it('accepts inline `$x_{0}$` math', async () => {
      const v = createMdxOutputValidator();
      const text = 'The value $x_{0}$ is initial.\n';
      const result = await v.validate(text, 'mdx');
      if (result.kind === 'driver-missing') return;
      expect(result.kind).toBe('ok');
    });
  });
});

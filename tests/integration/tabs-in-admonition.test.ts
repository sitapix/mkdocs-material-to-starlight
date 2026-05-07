/**
 * Regression test: tab content inside an admonition body must not produce
 * spurious `\::::` / `\:::` literal text in the output.
 *
 * Before the fix, the admonition normalizer emitted `:::example` (3-colon
 * fence) and the tabs normalizer emitted `:::tab[…]` (also 3-colon fence).
 * remark-directive's closing semantics terminate ALL open fences at a given
 * depth or fewer, so the `:::` closing the first tab also closed the
 * enclosing `:::example` admonition. Subsequent tabs became orphaned siblings
 * and the unclosed directive fences (`::::`, `:::`) were escaped as literal
 * text by remark-stringify, producing visible garbage `\::::` / `\:::` in
 * the rendered page.
 *
 * Reproduces the squidfunk/mkdocs-material `creating-your-site.md` artifact.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('tabs inside admonition (mkdocs-material regression)', () => {
  it('does not emit literal \\::: or \\:::: text when tabs appear inside an admonition', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'mts-tab-admon-'));
    const outputDir = mkdtempSync(join(tmpdir(), 'mts-tab-admon-out-'));
    try {
      mkdirSync(join(projectDir, 'docs'), { recursive: true });
      writeFileSync(join(projectDir, 'mkdocs.yml'), 'site_name: Test\ndocs_dir: docs\n');
      writeFileSync(
        join(projectDir, 'docs', 'index.md'),
        [
          '# Example',
          '',
          '!!! example',
          '',
          '    === "Tab A"',
          '        Content A',
          '',
          '    === "Tab B"',
          '        Content B',
          '',
        ].join('\n'),
      );

      const result = await convertSiteFromDisk({ projectDir, outputDir });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Conversion failed: ${JSON.stringify(result.error)}`);
      }

      const indexOut = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'), 'utf8');

      // The output must NOT contain escaped directive markers — these would
      // render as visible garbage in the Starlight page.
      expect(indexOut).not.toContain('\\:::');
      expect(indexOut).not.toContain('\\::::');

      // Both tab bodies must survive
      expect(indexOut).toContain('Content A');
      expect(indexOut).toContain('Content B');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

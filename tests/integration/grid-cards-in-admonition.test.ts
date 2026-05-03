/**
 * Regression test: grid-card content inside an admonition body must not be
 * silently dropped.
 *
 * Before the fix, the admonition normalizer emitted `:::tip` (3-colon fence)
 * and the grid normalizer emitted `:::card` (3-colon fence) for each item.
 * remark-directive's closing rule terminates ALL open fences at a given depth
 * or fewer, so the first `:::` closing a card would also close the enclosing
 * `:::tip`. The second and subsequent cards were emitted as siblings of the
 * admonition rather than children, and then lost during conversion.
 *
 * Reproduces the pydantic/pydantic `concepts/validators.md` silent-drop.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('grid-cards inside admonition (pydantic regression)', () => {
  it('preserves all card items when a grid is nested inside an admonition', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'mts-grid-admon-'));
    const outputDir = mkdtempSync(join(tmpdir(), 'mts-grid-admon-out-'));
    try {
      mkdirSync(join(projectDir, 'docs'), { recursive: true });
      writeFileSync(
        join(projectDir, 'mkdocs.yml'),
        'site_name: Test\ndocs_dir: docs\n',
      );
      writeFileSync(
        join(projectDir, 'docs', 'index.md'),
        [
          '# Quick reference',
          '',
          '!!! tip "Quick jump"',
          '',
          '    <div class="grid cards" markdown>',
          '',
          '    -   [__Validators__](validators.md)',
          '    -   [__Serialization__](serialization.md)',
          '',
          '    </div>',
          '',
        ].join('\n'),
      );

      const result = await convertSiteFromDisk({ projectDir, outputDir });
      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`Conversion failed: ${JSON.stringify(result.error)}`);
      }

      const indexOut = readFileSync(
        join(outputDir, 'src', 'content', 'docs', 'index.md'),
        'utf8',
      );

      // Both card items must survive in the output and the output must not
      // contain spurious escaped directive markers (visible garbage).
      expect(indexOut).toContain('Validators');
      expect(indexOut).toContain('Serialization');
      expect(indexOut).not.toContain('\\:::');
      expect(indexOut).not.toContain('\\::::');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

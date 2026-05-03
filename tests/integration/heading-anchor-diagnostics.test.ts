import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('heading explicit-id diagnostics', () => {
  it('emits heading-explicit-id-stripped diagnostic and removes the anchor from output', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-ha-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: T\ntheme: { name: material }\n');
    writeFileSync(join(project, 'docs', 'index.md'), [
      '# My Title { #my-anchor }',
      '',
      'Body text.',
      '',
    ].join('\n'));

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-ha-out-'));
    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The anchor should be stripped from the heading
    const body = readFileSync(join(out, 'src', 'content', 'docs', 'index.md'), 'utf8');
    expect(body).not.toMatch(/\{ #my-anchor \}/);
    expect(body).toMatch(/# My Title/);

    // A diagnostic should be emitted naming the stripped anchor
    const diag = result.value.diagnostics.find(
      (d) => d.diagnostic.ruleId === 'heading-explicit-id-stripped',
    );
    expect(diag).toBeDefined();
    expect(diag?.diagnostic.message).toContain('my-anchor');
  });
});

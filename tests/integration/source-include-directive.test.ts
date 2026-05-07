import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('{* path *} source-include directives', () => {
  it('replaces with TODO comment + emits per-occurrence diagnostic', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-snip-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: T\ntheme: { name: material }\n');
    writeFileSync(
      join(project, 'docs', 'index.md'),
      ['# Test', '', '{* docs_src/example.py *}', ''].join('\n'),
    );

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-snip-out-'));
    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const body = readFileSync(join(out, 'src', 'content', 'docs', 'index.md'), 'utf8');
    // The directive should be replaced with a TODO comment naming the path.
    expect(body).toMatch(/TODO.*docs_src\/example\.py/);
    // Should NOT be wrapped in a code fence.
    expect(body).not.toMatch(/```text\s*\{\* docs_src/);

    // A diagnostic should be emitted naming the directive.
    const diag = result.value.diagnostics.find(
      (d) => d.diagnostic.ruleId === 'source-include-directive-detected',
    );
    expect(diag).toBeDefined();
  });

  it('handles highlight markers like hl[3,4] in the directive', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-snip-hl-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: T\ntheme: { name: material }\n');
    writeFileSync(
      join(project, 'docs', 'index.md'),
      ['# Test', '', '{* docs_src/example.py hl[1,3] *}', ''].join('\n'),
    );

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-snip-hl-out-'));
    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const body = readFileSync(join(out, 'src', 'content', 'docs', 'index.md'), 'utf8');
    expect(body).toMatch(/TODO.*docs_src\/example\.py/);
    expect(body).not.toMatch(/```text/);
  });
});

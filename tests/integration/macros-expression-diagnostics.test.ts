import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('per-occurrence macros expression diagnostics', () => {
  it('emits macros-expression-detected for {{ foo }} without macros plugin', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-macro-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: T\ntheme: { name: material }\n');
    writeFileSync(join(project, 'docs', 'index.md'), [
      '# Test',
      '',
      'Value: {{ foo }}',
      '',
    ].join('\n'));

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-macro-out-'));
    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const diag = result.value.diagnostics.find(
      (d) => d.diagnostic.ruleId === 'macros-expression-detected',
    );
    expect(diag).toBeDefined();
    expect(diag?.diagnostic.message).toContain('{{ foo }}');
  });

  it('does not emit macros-expression-detected for {{ inside code fence }}', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-macro-fence-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), 'site_name: T\ntheme: { name: material }\n');
    writeFileSync(join(project, 'docs', 'index.md'), [
      '# Test',
      '',
      '```python',
      'x = {{ foo }}',
      '```',
      '',
    ].join('\n'));

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-macro-fence-out-'));
    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const diag = result.value.diagnostics.find(
      (d) => d.diagnostic.ruleId === 'macros-expression-detected',
    );
    expect(diag).toBeUndefined();
  });
});

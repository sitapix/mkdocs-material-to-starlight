import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('INHERIT with !ENV tags (tiangolo/typer regression)', () => {
  it('converts a project whose inherited base uses !ENV', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-env-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(
      join(project, 'mkdocs.env.yml'),
      [
        'markdown_extensions:',
        '  pymdownx.highlight:',
        '    linenums: !ENV [LINENUMS, false]',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(project, 'mkdocs.yml'),
      [
        'INHERIT: ./mkdocs.env.yml',
        'site_name: T',
        'theme:',
        '  name: material',
        'markdown_extensions:',
        '  pymdownx.highlight:',
        '    line_spans: __span',
        '',
      ].join('\n'),
    );
    writeFileSync(join(project, 'docs', 'index.md'), '# Hello\n');

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-env-out-'));
    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
  });
});

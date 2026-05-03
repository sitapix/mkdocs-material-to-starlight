import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('mkdocstrings autodoc directives in source (pydantic regression)', () => {
  it('does not emit literal \\::: in the output', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-mkd-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), [
      'site_name: T',
      'theme: { name: material }',
      'plugins:',
      '  - mkdocstrings',
      '',
    ].join('\n'));
    writeFileSync(join(project, 'docs', 'api.md'), [
      '# API',
      '',
      '::: pydantic.networks',
      '    options:',
      '      show_root_heading: true',
      '',
    ].join('\n'));

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-mkd-out-'));
    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    // Read whatever extension the output was written as (.md or .mdx).
    let body: string;
    try { body = readFileSync(join(out, 'src', 'content', 'docs', 'api.md'), 'utf8'); }
    catch { body = readFileSync(join(out, 'src', 'content', 'docs', 'api.mdx'), 'utf8'); }

    expect(body).not.toMatch(/\\:::/); // no literal escaped colons
    // The original directive content should be preserved somewhere in some form
    // (as a comment, code, or plain text) so the user can find and convert it.
    expect(body).toMatch(/pydantic\.networks/);
  });

  it('does not emit literal \\::: for bare mkdocstrings directive with no options body', async () => {
    // A bare ::: line with no indented options block — this was NOT handled by
    // normalizeMkautodocBlocks (which requires 4+ space indented body to distinguish
    // from real Starlight directives). These bare directives still escape to \:::
    // in the output. The normalizer must also handle this pattern.
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-mkd2-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(join(project, 'mkdocs.yml'), [
      'site_name: T',
      'theme: { name: material }',
      'plugins:',
      '  - mkdocstrings',
      '',
    ].join('\n'));
    writeFileSync(join(project, 'docs', 'api.md'), [
      '# API',
      '',
      '::: pydantic.networks',
      '',
      'Some text after.',
      '',
    ].join('\n'));

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-mkd2-out-'));
    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    let body: string;
    try { body = readFileSync(join(out, 'src', 'content', 'docs', 'api.md'), 'utf8'); }
    catch { body = readFileSync(join(out, 'src', 'content', 'docs', 'api.mdx'), 'utf8'); }

    expect(body).not.toMatch(/\\:::/); // no literal escaped colons
    expect(body).toMatch(/pydantic\.networks/);
  });
});

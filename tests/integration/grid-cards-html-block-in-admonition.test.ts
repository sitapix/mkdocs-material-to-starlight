import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('grid-cards HTML block inside admonition body (pydantic regression)', () => {
  it('preserves grid-card link list items (dash markers)', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-grid-html-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(
      join(project, 'mkdocs.yml'),
      [
        'site_name: T',
        'theme:',
        '  name: material',
        'markdown_extensions:',
        '  - admonition',
        '  - attr_list',
        '  - md_in_html',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(project, 'docs', 'index.md'),
      [
        '!!! tip "Quick jump"',
        '',
        '    <div class="grid cards" markdown>',
        '',
        '    -   [:material-card-text-outline: __Validators__](validators.md)',
        '    -   [:material-card-text-outline: __Serialization__](serialization.md)',
        '',
        '    </div>',
        '',
      ].join('\n'),
    );

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-grid-html-out-'));
    const result = await convertSiteFromDisk({
      projectDir: project,
      outputDir: out,
    });
    expect(result.ok).toBe(true);

    // Material icons promote the file to `.mdx` (JSX `<Icon>` tag).
    const indexOut = readFileSync(join(out, 'src', 'content', 'docs', 'index.mdx'), 'utf8');
    expect(indexOut).toMatch(/Validators/);
    expect(indexOut).toMatch(/Serialization/);
    expect(indexOut).not.toMatch(/sl-card-grid"\s*>\s*<\/div>/);
    expect(indexOut).not.toMatch(/sl-card-grid">\s*<\/div>/);
  });

  it('preserves grid-card content with asterisk list markers (exact pydantic shape)', async () => {
    const project = mkdtempSync(join(tmpdir(), 'mk2sl-grid-html-ast-'));
    mkdirSync(join(project, 'docs'), { recursive: true });
    writeFileSync(
      join(project, 'mkdocs.yml'),
      [
        'site_name: T',
        'theme:',
        '  name: material',
        'markdown_extensions:',
        '  - admonition',
        '  - attr_list',
        '  - md_in_html',
        '',
      ].join('\n'),
    );
    // Exact pydantic validators.md shape: asterisk list markers with nested content
    writeFileSync(
      join(project, 'docs', 'index.md'),
      [
        '!!! tip',
        '    Want to quickly jump to the relevant validator section?',
        '',
        '    <div class="grid cards" markdown>',
        '',
        '    *   Field validators',
        '',
        '        ---',
        '',
        '        * [field *after* validators](#field-after-validator)',
        '        * [field *before* validators](#field-before-validator)',
        '',
        '    *   Model validators',
        '',
        '        ---',
        '',
        '        * [model *before* validators](#model-before-validator)',
        '        * [model *after* validators](#model-after-validator)',
        '',
        '    </div>',
        '',
      ].join('\n'),
    );

    const out = mkdtempSync(join(tmpdir(), 'mk2sl-grid-html-ast-out-'));
    const result = await convertSiteFromDisk({
      projectDir: project,
      outputDir: out,
    });
    expect(result.ok).toBe(true);

    const indexOut = readFileSync(join(out, 'src', 'content', 'docs', 'index.md'), 'utf8');
    // The grid-card content MUST be present in the output (the bug was that
    // asterisk-marked list items were silently dropped, leaving an empty
    // <div class="sl-card-grid"></div> because only "-" markers were recognized).
    expect(indexOut).toMatch(/Field validators/);
    expect(indexOut).toMatch(/Model validators/);
    // And the output must NOT contain an empty sl-card-grid div.
    expect(indexOut).not.toMatch(/sl-card-grid"\s*>\s*<\/div>/);
    expect(indexOut).not.toMatch(/sl-card-grid">\s*<\/div>/);
  });
});

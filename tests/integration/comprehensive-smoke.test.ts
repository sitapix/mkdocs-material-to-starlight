import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

/**
 * Single comprehensive smoke test exercising every supported feature on a
 * realistic synthetic MkDocs Material site.
 *
 * Coverage matrix:
 *   - Frontmatterless source            → ensure-title synthesizes
 *   - Admonition with title             → :::caution[Title]
 *   - Collapsible admonition (???)      → <details>
 *   - Content tabs (===)                → <div class="sl-tabs">
 *   - Card grid (grid cards)            → <div class="sl-card-grid">
 *   - Generic grid                      → <div class="sl-grid">
 *   - Material icon                     → :icon[name]
 *   - FontAwesome icon                  → :icon[github]
 *   - Internal link                     → rewritten to /slug
 *   - Inline snippet                    → expanded
 *   - Block snippet                     → expanded
 *   - Inline marks (==/~~/^/++)         → <mark>/<sub>/<sup>/<kbd>
 *   - .pages title override             → applied to sidebar
 *   - .pages collapse                   → collapsed: true emitted
 *   - Asset copy (binary file)          → present in public/
 *   - Nested directory structure        → preserved
 */

describe('comprehensive end-to-end conversion', () => {
  let projectDir: string;
  let outputDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'mts-comp-proj-'));
    outputDir = mkdtempSync(join(tmpdir(), 'mts-comp-out-'));
    setupProject(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('converts every supported feature on a realistic site', async () => {
    const result = await convertSiteFromDisk({
      projectDir,
      outputDir,
      snippetBasePaths: ['docs'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    const indexOut = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'), 'utf8');

    // Frontmatter title synthesized (source had none)
    expect(indexOut).toContain('title: Home');

    // Admonition: warning → caution, title preserved
    expect(indexOut).toContain(':::caution[Heads up]');

    // Collapsible: ??? tip → <details>
    expect(indexOut).toContain('<details>');
    expect(indexOut).toContain('<summary>Click to reveal</summary>');

    // Content tabs → Starlight <Tabs>+<TabItem> (default MDX mode)
    expect(indexOut).toContain('<Tabs>');
    expect(indexOut).toContain('<TabItem label="macOS">');
    expect(indexOut).toContain('<TabItem label="Linux">');

    // Card grid
    expect(indexOut).toContain('<div class="sl-card-grid">');
    expect(indexOut).toContain('<div class="sl-card">');

    // Generic grid
    expect(indexOut).toContain('<div class="sl-grid">');

    // Icons render as JSX `<Icon>` tags so Starlight's auto-injected
    // `Icon` import resolves them — the legacy `:icon[name]` directive
    // form would render as `<div>name</div>` (no remark plugin).
    expect(indexOut).toContain('<Icon name="rocket" class="sl-inline-icon" />');
    expect(indexOut).toContain('<Icon name="github" class="sl-inline-icon" />');

    // Internal link rewriting
    expect(indexOut).toContain('[auth](/api/auth)');

    // Inline marks
    expect(indexOut).toContain('<mark>highlighted</mark>');
    expect(indexOut).toContain('H<sub>2</sub>O');
    expect(indexOut).toContain('2<sup>10</sup>');
    expect(indexOut).toContain('<kbd>Ctrl</kbd>');

    // Snippet expansion (inline)
    expect(indexOut).toContain('Shared intro body.');
    expect(indexOut).not.toContain('--8<-- "intro.md"');

    // Snippet expansion (block-form)
    expect(indexOut).toContain('Block snippet alpha.');
    expect(indexOut).toContain('Block snippet beta.');

    // Nested directory output
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'api', 'auth.md'))).toBe(true);

    // Asset copy
    expect(existsSync(join(outputDir, 'public', 'images', 'logo.png'))).toBe(true);

    // .pages title + collapse override on sidebar
    const astroConfig = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(astroConfig).toContain(`label: 'API Reference'`);
    expect(astroConfig).toContain('collapsed: true');

    // Project scaffold complete
    expect(existsSync(join(outputDir, 'package.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'astro.config.mjs'))).toBe(true);
    expect(existsSync(join(outputDir, 'MIGRATION_NOTES.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'styles', 'mkdocs-migration.css'))).toBe(true);

    // No diagnostics on the happy path
    const unexpectedDiags = result.value.diagnostics.filter(
      (d) => d.diagnostic.severity === 'error' || d.diagnostic.ruleId === 'broken-link',
    );
    expect(unexpectedDiags).toEqual([]);
  });
});

function setupProject(projectDir: string): void {
  mkdirSync(join(projectDir, 'docs', 'api'), { recursive: true });
  mkdirSync(join(projectDir, 'docs', 'images'), { recursive: true });

  writeFileSync(
    join(projectDir, 'mkdocs.yml'),
    [
      'site_name: Comprehensive Demo',
      'site_description: Exercises every feature.',
      'nav:',
      '  - Home: index.md',
      '  - API:',
      '      - api/auth.md',
      '',
    ].join('\n'),
  );

  // index.md has no frontmatter; exercises every inline + block feature
  writeFileSync(
    join(projectDir, 'docs', 'index.md'),
    [
      '!!! warning "Heads up"',
      '    See [auth](api/auth.md).',
      '',
      '??? tip "Click to reveal"',
      '    Hidden by default.',
      '',
      '=== "macOS"',
      '    brew install foo',
      '',
      '=== "Linux"',
      '    apt install foo',
      '',
      '<div class="grid cards" markdown>',
      '',
      '- :material-rocket: __Speed__ — fast.',
      '- :fontawesome-brands-github: __Source__ — open.',
      '',
      '</div>',
      '',
      '<div class="grid" markdown>',
      '',
      '!!! note',
      '    A boxed note.',
      '',
      '</div>',
      '',
      '==highlighted== text.',
      '',
      'H~2~O is water and 2^10^ = 1024.',
      '',
      'Press ++ctrl+s++ to save.',
      '',
      '--8<-- "intro.md"',
      '',
      '--8<--',
      'block-a.md',
      'block-b.md',
      '--8<--',
      '',
    ].join('\n'),
  );

  writeFileSync(join(projectDir, 'docs', 'api', 'auth.md'), '# Authentication\n');

  writeFileSync(
    join(projectDir, 'docs', 'api', '.pages'),
    'title: API Reference\ncollapse: true\n',
  );

  // Snippets — placed in docs so the snippet base path resolves them
  writeFileSync(join(projectDir, 'docs', 'intro.md'), 'Shared intro body.\n');
  writeFileSync(join(projectDir, 'docs', 'block-a.md'), 'Block snippet alpha.\n');
  writeFileSync(join(projectDir, 'docs', 'block-b.md'), 'Block snippet beta.\n');

  // Asset
  writeFileSync(
    join(projectDir, 'docs', 'images', 'logo.png'),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
}

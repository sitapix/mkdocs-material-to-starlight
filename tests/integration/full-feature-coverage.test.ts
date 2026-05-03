import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

/**
 * The "everything" integration test. Builds a realistic Material site that
 * exercises every feature this codebase claims to support, runs the full
 * conversion pipeline, and verifies:
 *
 *   1. The output content has the expected Starlight markup for each feature.
 *   2. The recommended-dep loop fires for source-driven features (math,
 *      mermaid) AND plugin-driven features (glightbox, mike) — both the
 *      package.json deps and the astro.config.mjs imports/wiring land.
 *   3. The conversion is idempotent at the SITE level: running it twice
 *      against the same input produces byte-equal output trees.
 *
 * This is the regression net for any future architectural change. If a
 * normalizer goes order-coupled or a serializer goes non-deterministic,
 * idempotency catches it before any unit test sees the bug.
 */

describe('full feature coverage end-to-end', () => {
  let projectDir: string;
  let outputDir: string;
  let outputDir2: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'mts-full-proj-'));
    outputDir = mkdtempSync(join(tmpdir(), 'mts-full-out-'));
    outputDir2 = mkdtempSync(join(tmpdir(), 'mts-full-out2-'));
    setupProject(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
    rmSync(outputDir2, { recursive: true, force: true });
  });

  it('converts every feature shipped to date and produces a buildable Starlight project', async () => {
    const result = await convertSiteFromDisk({
      projectDir,
      outputDir,
      snippetBasePaths: ['docs'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);

    const indexOut = readFileSync(
      join(outputDir, 'src', 'content', 'docs', 'index.md'),
      'utf8',
    );

    // pymdownx.blocks.* — /// note → :::note (admonition)
    expect(indexOut).toContain(':::note[Modern Block]');
    expect(indexOut).not.toContain('/// note');

    // pymdownx.blocks.* — /// details → <details><summary>
    expect(indexOut).toMatch(/<details>/);
    expect(indexOut).toMatch(/<summary>Click to reveal<\/summary>/);

    // pymdownx.blocks.* — /// tab grouping
    expect(indexOut).toContain('data-label="Python"');
    expect(indexOut).toContain('data-label="Ruby"');

    // Material buttons → <a class="md-button">
    expect(indexOut).toContain('class="md-button md-button--primary"');
    expect(indexOut).toContain('class="md-button"');

    // Definition lists → <dl>/<dt>/<dd>. The term `API` is wrapped by the
    // abbreviation normalizer (which runs first, by design), so the <dt>
    // contains <abbr title>API</abbr> rather than bare 'API' — that's the
    // composed-pipeline contract, not a bug.
    expect(indexOut).toContain('<dl>');
    expect(indexOut).toMatch(/<dt><abbr [^>]*>API<\/abbr><\/dt>/);
    expect(indexOut).toContain('<dd>Application interface.</dd>');

    // Abbreviations → every occurrence wrapped, definition line stripped
    expect(indexOut).toContain('<abbr title="Application Programming Interface">API</abbr>');
    expect(indexOut).not.toContain('*[API]:');

    // Critic Markup → <ins>/<del>/<mark>/<span>
    expect(indexOut).toContain('<ins>added</ins>');
    expect(indexOut).toContain('<del>removed</del>');
    expect(indexOut).toContain('<mark>important</mark>');

    // Footnotes pass through via remark-gfm
    expect(indexOut).toContain('[^1]');
    expect(indexOut).toContain('Footnote body.');

    // Math passes through
    expect(indexOut).toContain('$$');
    expect(indexOut).toContain('E = mc^2');

    // Mermaid passes through
    expect(indexOut).toContain('```mermaid');
    expect(indexOut).toContain('graph LR');

    // Recommended-dep loop fired for source-driven features
    const packageJson = JSON.parse(
      readFileSync(join(outputDir, 'package.json'), 'utf8'),
    );
    expect(packageJson.dependencies).toHaveProperty('remark-math');
    expect(packageJson.dependencies).toHaveProperty('rehype-katex');
    expect(packageJson.dependencies).toHaveProperty('astro-mermaid');

    // Recommended-dep loop fired for plugin-driven features
    expect(packageJson.dependencies).toHaveProperty('starlight-image-zoom');
    expect(packageJson.dependencies).toHaveProperty('starlight-versions');

    // astro.config.mjs imports and wires every detected plugin
    const astroConfig = readFileSync(
      join(outputDir, 'astro.config.mjs'),
      'utf8',
    );
    expect(astroConfig).toContain(`import remarkMath from 'remark-math';`);
    expect(astroConfig).toContain(`import rehypeKatex from 'rehype-katex';`);
    expect(astroConfig).toContain(`import mermaid from 'astro-mermaid';`);
    expect(astroConfig).toContain(`import imageZoom from 'starlight-image-zoom';`);
    expect(astroConfig).toContain(`import starlightVersions from 'starlight-versions';`);
    expect(astroConfig).toContain('mermaid()');
    expect(astroConfig).toContain('imageZoom()');
    expect(astroConfig).toContain('remarkMath');
    expect(astroConfig).toContain('rehypeKatex');
    expect(astroConfig).toContain('starlightVersions(');

    // Project scaffold complete
    expect(existsSync(join(outputDir, 'package.json'))).toBe(true);
    expect(existsSync(join(outputDir, 'astro.config.mjs'))).toBe(true);
    expect(existsSync(join(outputDir, 'MIGRATION_NOTES.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'styles', 'mkdocs-migration.css'))).toBe(true);
  });

  it('is idempotent at the site level — running twice yields byte-equal output trees', async () => {
    const first = await convertSiteFromDisk({
      projectDir,
      outputDir,
      snippetBasePaths: ['docs'],
    });
    expect(first.ok).toBe(true);

    const second = await convertSiteFromDisk({
      projectDir,
      outputDir: outputDir2,
      snippetBasePaths: ['docs'],
    });
    expect(second.ok).toBe(true);

    const tree1 = collectTextFiles(outputDir);
    const tree2 = collectTextFiles(outputDir2);

    expect(Object.keys(tree2).sort()).toEqual(Object.keys(tree1).sort());
    for (const path of Object.keys(tree1)) {
      expect(tree2[path]).toBe(tree1[path]);
    }
  });

  it('wizard --yes idempotency — running twice with explicit wizard defaults yields byte-equal output', async () => {
    // The wizard derives defaults (deriveDefaults.ts) and passes them to the API.
    // This test asserts that running the conversion twice with those same
    // explicit wizard defaults produces byte-equal output. This verifies that
    // the conversion is deterministic and idempotent when the wizard runs
    // `mkdocs-to-starlight --yes` twice.
    const wizardDefaults = {
      snippetBasePaths: ['docs'],
      linksValidator: true,
      tabs: 'mdx' as const,
      rss: true,
      palette: 'translate' as const,
      configFormat: 'mjs' as const,
      cards: 'html' as const,
      mdxMode: 'auto' as const,
      logoReplacesTitle: false,
      keepExplicitHeadingIds: false,
      noSmartSymbols: false,
      noEmojiShortcodes: false,
      noInlineMarks: false,
      noAutoAppend: false,
      snippetMaxDepth: 8,
      snippetDedentSubsections: false,
      expressiveCodeTheme: null,
      admonitionMapPath: null,
    };

    const firstRun = await convertSiteFromDisk({
      projectDir,
      outputDir,
      ...wizardDefaults,
    });
    expect(firstRun.ok).toBe(true);

    const secondRun = await convertSiteFromDisk({
      projectDir,
      outputDir: outputDir2,
      ...wizardDefaults,
    });
    expect(secondRun.ok).toBe(true);

    const tree1 = collectTextFiles(outputDir);
    const tree2 = collectTextFiles(outputDir2);

    expect(Object.keys(tree2).sort()).toEqual(Object.keys(tree1).sort());
    for (const path of Object.keys(tree1)) {
      expect(tree2[path]).toBe(tree1[path]);
    }
  });
});

function setupProject(projectDir: string): void {
  mkdirSync(join(projectDir, 'docs'), { recursive: true });

  writeFileSync(
    join(projectDir, 'mkdocs.yml'),
    [
      'site_name: Full Coverage Demo',
      'site_description: Exercises every shipped feature.',
      'nav:',
      '  - Home: index.md',
      'plugins:',
      '  - search',
      '  - glightbox',
      '  - mike',
      'markdown_extensions:',
      '  - admonition',
      '  - pymdownx.details',
      '  - pymdownx.superfences',
      '  - pymdownx.tabbed',
      '  - pymdownx.snippets',
      '  - pymdownx.mark',
      '  - pymdownx.tilde',
      '  - pymdownx.caret',
      '  - pymdownx.keys',
      '  - pymdownx.critic',
      '  - pymdownx.arithmatex',
      '  - footnotes',
      '  - abbr',
      '  - def_list',
      '  - attr_list',
      '  - md_in_html',
      '',
    ].join('\n'),
  );

  // index.md packs every shipped feature.
  writeFileSync(
    join(projectDir, 'docs', 'index.md'),
    [
      '# Home',
      '',
      '## pymdownx.blocks family',
      '',
      '/// note | Modern Block',
      'New syntax replaces legacy admonitions.',
      '///',
      '',
      '/// details | Click to reveal',
      'Hidden detail body.',
      '///',
      '',
      '/// tab | Python',
      'print("hello")',
      '///',
      '',
      '/// tab | Ruby',
      'puts "hello"',
      '///',
      '',
      '## Buttons',
      '',
      '[Subscribe](#subscribe){ .md-button .md-button--primary }',
      '[Learn more](#learn){ .md-button }',
      '',
      '## Definition list',
      '',
      'API',
      ':   Application interface.',
      '',
      '## Abbreviations',
      '',
      'The API is documented here.',
      '',
      '*[API]: Application Programming Interface',
      '',
      '## Critic Markup',
      '',
      'Text {++added++} and {--removed--} and {==important==} marks.',
      '',
      '## Footnotes',
      '',
      'A reference[^1] in the prose.',
      '',
      '[^1]: Footnote body.',
      '',
      '## Math',
      '',
      '$$',
      'E = mc^2',
      '$$',
      '',
      '## Mermaid',
      '',
      '```mermaid',
      'graph LR; A-->B',
      '```',
      '',
    ].join('\n'),
  );
}

function collectTextFiles(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        walk(abs);
        continue;
      }
      // Skip binary files; only compare text outputs for idempotency.
      const rel = relative(root, abs);
      if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$/i.test(rel)) {
        continue;
      }
      out[rel] = readFileSync(abs, 'utf8');
    }
  }
  walk(root);
  return out;
}

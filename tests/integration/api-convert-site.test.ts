import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('interface/api/convertSiteFromDisk', () => {
  let projectDir: string;
  let outputDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'mts-proj-'));
    outputDir = mkdtempSync(join(tmpdir(), 'mts-out-'));

    mkdirSync(join(projectDir, 'docs', 'api'), { recursive: true });
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'nav:',
        '  - Home: index.md',
        '  - API: api/auth.md',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      ['# Welcome', '', '!!! warning "Heads up"', '    See [auth](api/auth.md).', ''].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'docs', 'api', 'auth.md'),
      ['# Authentication', '', ':material-rocket: launch the API.', ''].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('reads a real MkDocs project from disk and writes converted Markdown', async () => {
    const result = await convertSiteFromDisk({
      projectDir,
      outputDir,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const indexOut = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.md'), 'utf8');
    expect(indexOut).toContain(':::caution');
    expect(indexOut).toContain('Heads up');
    expect(indexOut).toContain('[auth](/api/auth)');

    // Files using icons get promoted to `.mdx` so the JSX `<Icon>` tag
    // resolves through Starlight's auto-injected import.
    const authOut = readFileSync(
      join(outputDir, 'src', 'content', 'docs', 'api', 'auth.mdx'),
      'utf8',
    );
    expect(authOut).toContain('<Icon name="rocket" class="sl-inline-icon" />');
    // `# Authentication` body H1 was stripped because it duplicates the
    // synthesized frontmatter title. Starlight renders the title from
    // frontmatter, so leaving the body H1 produces a visible duplicate.
    expect(authOut).not.toMatch(/^# Authentication\b/m);
    expect(authOut).toContain('title: Authentication');

    // Only informational diagnostics produced: `mdx-promotion` (auth.md
    // → .mdx because of the `<Icon>` tag) and `duplicate-h1-stripped`
    // (the body H1 → frontmatter title dedupe). No actual problems.
    const informationalIds = new Set(['mdx-promotion', 'duplicate-h1-stripped']);
    const nonInformational = result.value.diagnostics.filter(
      (d) => !informationalIds.has(d.diagnostic.ruleId),
    );
    expect(nonInformational).toEqual([]);
    expect(result.value.sidebarSource).toContain(`label: 'Home'`);
    expect(result.value.sidebarSource).toContain(`label: 'API'`);
  });

  it('returns a typed error when mkdocs.yml is missing', async () => {
    rmSync(join(projectDir, 'mkdocs.yml'));
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('config-not-found');
    }
  });

  it('auto-discovers a single nested mkdocs.yml and converts from there', async () => {
    // Move the project into a wrapper layout: <root>/website/{mkdocs.yml,docs/}
    rmSync(join(projectDir, 'mkdocs.yml'));
    const websiteDir = join(projectDir, 'website');
    mkdirSync(join(websiteDir, 'docs'), { recursive: true });
    writeFileSync(
      join(websiteDir, 'mkdocs.yml'),
      ['site_name: Demo', 'docs_dir: docs', ''].join('\n'),
    );
    writeFileSync(join(websiteDir, 'docs', 'index.md'), '# Welcome\n');
    rmSync(join(projectDir, 'docs'), { recursive: true });

    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Output is written under the user's chosen outputDir, with the site
    // resolved against the discovered website/ subdir.
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.md'))).toBe(true);

    // The redirect is surfaced as an info diagnostic.
    const redirect = result.value.diagnostics.find(
      (d) => d.diagnostic.ruleId === 'mkdocs-config-auto-discovered',
    );
    expect(redirect).toBeDefined();
    expect(redirect?.diagnostic.message).toContain('website/mkdocs.yml');
  });

  it('returns config-ambiguous with candidates when multiple mkdocs.yml are found', async () => {
    rmSync(join(projectDir, 'mkdocs.yml'));
    rmSync(join(projectDir, 'docs'), { recursive: true });
    for (const sub of ['website', 'docs-site', 'examples/foo']) {
      const dir = join(projectDir, sub);
      mkdirSync(join(dir, 'docs'), { recursive: true });
      writeFileSync(join(dir, 'mkdocs.yml'), ['site_name: Demo', 'docs_dir: docs', ''].join('\n'));
      writeFileSync(join(dir, 'docs', 'index.md'), '# Welcome\n');
    }

    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('config-ambiguous');
    const sortedCandidates = [...(result.error.candidates ?? [])].sort();
    expect(sortedCandidates).toEqual([
      'docs-site/mkdocs.yml',
      'examples/foo/mkdocs.yml',
      'website/mkdocs.yml',
    ]);
    expect(result.error.message).toContain('docs-site/mkdocs.yml');
    expect(result.error.message).toContain('Re-run pointing at');
  });

  it('returns a typed error when docs/ is missing (vanilla mkdocs.yml)', async () => {
    rmSync(join(projectDir, 'docs'), { recursive: true });
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('directory-read-failed');
      // No generator plugin in this config → don't recommend running one.
      expect(result.error.message.toLowerCase()).not.toContain('gen-files');
    }
  });

  it('hints to run gen-files first when docs/ is missing and the plugin is configured', async () => {
    // Reproduces the ethereum/consensus-specs scenario: mkdocs.yml uses
    // mkdocs-gen-files to materialise docs/ from Python at build time, so
    // the converter sees no docs/ on disk. Explain the situation instead of
    // emitting a bare "directory not found".
    rmSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - search',
        '  - gen-files:',
        '      scripts:',
        '        - scripts/build_docs.py',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('directory-read-failed');
      expect(result.error.message).toContain('gen-files');
      // Should give actionable next-step language, not just name the plugin.
      expect(result.error.message.toLowerCase()).toMatch(/build|generate|run/);
    }
  });

  it('scaffolds biome.json + Biome devDep + format scripts so users can run `npm run format` after install', async () => {
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // biome.json lands at the project root.
    const biomeJsonPath = join(outputDir, 'biome.json');
    expect(existsSync(biomeJsonPath)).toBe(true);
    const biomeJson = JSON.parse(readFileSync(biomeJsonPath, 'utf8')) as {
      $schema?: string;
      files?: { includes?: string[] };
    };
    expect(biomeJson.$schema).toMatch(/biomejs\.dev/);
    // .md / .mdx are intentionally excluded — Biome has no Markdown parser
    // and the converter's remark-stringify output is the canonical form.
    expect(biomeJson.files?.includes ?? []).toContain('!**/*.md');
    expect(biomeJson.files?.includes ?? []).toContain('!**/*.mdx');

    // package.json carries Biome as a devDep + the `format`/`lint` scripts.
    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.devDependencies?.['@biomejs/biome']).toMatch(/^\^?\d/);
    expect(pkg.scripts?.format).toContain('biome format');
    expect(pkg.scripts?.lint).toContain('biome lint');
    expect(pkg.scripts?.['format:check']).toContain('biome format');
  });

  it('hints when monorepo plugin is configured and docs/ is missing', async () => {
    rmSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      ['site_name: Demo', 'docs_dir: docs', 'plugins:', '  - monorepo', ''].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('directory-read-failed');
      expect(result.error.message).toContain('monorepo');
    }
  });

  it('returns a typed error when mkdocs.yml is malformed YAML', async () => {
    writeFileSync(join(projectDir, 'mkdocs.yml'), 'this: is\n  : broken\n');
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['yaml-decode-failed', 'config-invalid']).toContain(result.error.code);
    }
  });

  it('writes outputs idempotently — running twice yields identical files', async () => {
    await convertSiteFromDisk({ projectDir, outputDir });
    const indexOnce = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.md'), 'utf8');

    await convertSiteFromDisk({ projectDir, outputDir });
    const indexTwice = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.md'), 'utf8');

    expect(indexTwice).toBe(indexOnce);
  });

  it('preserves the source directory structure in the output', async () => {
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.md'))).toBe(true);
    // auth.md uses `:material-rocket:` which now emits a JSX `<Icon>` and
    // therefore promotes the file to `.mdx`.
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'api', 'auth.mdx'))).toBe(true);
  });

  it('copies non-Markdown assets to outputDir/public/ preserving paths', async () => {
    mkdirSync(join(projectDir, 'docs', 'images'), { recursive: true });
    writeFileSync(
      join(projectDir, 'docs', 'images', 'diagram.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'public', 'images', 'diagram.png'))).toBe(true);
  });

  it('synthesizes a title for source files that lack frontmatter', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), 'No frontmatter here, just body.\n');
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const indexOut = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.md'), 'utf8');
    expect(indexOut).toContain('title: Home');
  });

  it('surfaces plugin diagnostics in MIGRATION_NOTES.md for unmappable plugins', async () => {
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - search',
        '  - social',
        '  - typeset',
        '  - mkdocstrings',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('plugin-social-mapped');
    expect(notes).toContain('plugin-typeset-deprecated');
    expect(notes).toContain('plugin-mkdocstrings-no-equivalent');
    // The search plugin emits an info-level acknowledgement that Pagefind
    // takes over (`plugin-search-replaced`); other "recognized" plugins
    // (glightbox, mike, blog, tags, redirects, last-updated, rss, i18n,
    // include-markdown, literate-nav, section-index) stay silent.
    expect(notes).toContain('plugin-search-replaced');
  });

  it('emits a redirects: block in astro.config.mjs when mkdocs-redirects is configured', async () => {
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - search',
        '  - redirects:',
        '      redirect_maps:',
        '        old.md: api/auth.md',
        '        gone.md: https://elsewhere.example/page',
        'nav:',
        '  - Home: index.md',
        '  - API: api/auth.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain('redirects: {');
    expect(cfg).toContain(`'/old': '/api/auth'`);
    expect(cfg).toContain(`'/gone': 'https://elsewhere.example/page'`);
  });

  it('hoists section index.md to the top of its group when section-index plugin is enabled', async () => {
    mkdirSync(join(projectDir, 'docs', 'api'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'api', 'index.md'), '# API Overview\n');
    writeFileSync(join(projectDir, 'docs', 'api', 'auth.md'), '# Auth\n');
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - section-index',
        'nav:',
        '  - Home: index.md',
        '  - API:',
        '      - api/auth.md',
        '      - api/index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    // 'api' (index page slug) appears before 'api/auth' inside the API group.
    const apiIdx = cfg.indexOf("'api'");
    const authIdx = cfg.indexOf("'api/auth'");
    expect(apiIdx).toBeGreaterThan(0);
    expect(authIdx).toBeGreaterThan(0);
    expect(apiIdx).toBeLessThan(authIdx);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('plugin-section-index-applied');
  });

  it('does not reorder sections when section-index plugin is absent', async () => {
    mkdirSync(join(projectDir, 'docs', 'api'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'api', 'index.md'), '# API Overview\n');
    writeFileSync(join(projectDir, 'docs', 'api', 'auth.md'), '# Auth\n');
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'nav:',
        '  - Home: index.md',
        '  - API:',
        '      - api/auth.md',
        '      - api/index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    const authIdx = cfg.indexOf("'api/auth'");
    const apiIdx = cfg.indexOf("'api'");
    expect(authIdx).toBeGreaterThan(0);
    expect(apiIdx).toBeGreaterThan(0);
    // Without the plugin, original nav order is preserved.
    expect(authIdx).toBeLessThan(apiIdx);
  });

  it('uses SUMMARY.md as the nav source when literate-nav plugin is enabled', async () => {
    mkdirSync(join(projectDir, 'docs', 'api'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(join(projectDir, 'docs', 'api', 'auth.md'), '# Auth\n');
    writeFileSync(join(projectDir, 'docs', 'api', 'users.md'), '# Users\n');
    writeFileSync(
      join(projectDir, 'docs', 'SUMMARY.md'),
      [
        '# Navigation',
        '',
        '* [Home](index.md)',
        '* API',
        '    * [Auth](api/auth.md)',
        '    * [Users](api/users.md)',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - literate-nav',
        // No nav: block — literate-nav supplies it.
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    // Verify the SUMMARY.md structure landed in the sidebar.
    expect(cfg).toContain("label: 'Home'");
    expect(cfg).toContain("label: 'API'");
    expect(cfg).toContain("'api/auth'");
    expect(cfg).toContain("'api/users'");
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('plugin-literate-nav-applied');
  });

  it('emits a no-summary diagnostic when literate-nav is enabled but SUMMARY.md is missing', async () => {
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - literate-nav',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('plugin-literate-nav-no-summary');
    // Should still build with the yaml nav as a fallback.
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain('Home');
  });

  it('reports per-file mkdocs-macros Jinja2 occurrences when the macros plugin is enabled', async () => {
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      [
        '# Home',
        '',
        'Hello {{ user.name }}!',
        '',
        '{% if env == "prod" %}live{% endif %}',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - macros',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    // Plugin-level diagnostic.
    expect(notes).toContain('plugin-macros-detected');
    // Per-occurrence diagnostics with file:line locator.
    expect(notes).toContain('plugin-macros-occurrence');
    expect(notes).toContain('index.md:3');
    expect(notes).toContain('index.md:5');
  });

  it('emits warnings for unmappable plugins (gen-files, print-site, monorepo, multirepo)', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - gen-files',
        '  - print-site',
        '  - monorepo',
        '  - multirepo',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('plugin-gen-files-no-equivalent');
    expect(notes).toContain('plugin-print-site-no-equivalent');
    expect(notes).toContain('plugin-monorepo-no-equivalent');
    expect(notes).toContain('plugin-multirepo-no-equivalent');
  });

  it('scaffolds an RSS endpoint when the rss plugin is enabled', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: My Docs',
        'site_description: Demo description.',
        'site_url: https://docs.example.com',
        'docs_dir: docs',
        'plugins:',
        '  - rss',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    // Endpoint file scaffolded.
    const rssPath = join(outputDir, 'src', 'pages', 'rss.xml.ts');
    expect(existsSync(rssPath)).toBe(true);
    const rssSource = readFileSync(rssPath, 'utf8');
    expect(rssSource).toContain("import rss from '@astrojs/rss'");
    expect(rssSource).toContain("title: 'My Docs'");
    expect(rssSource).toContain("description: 'Demo description.'");
    expect(rssSource).toContain('https://docs.example.com');
    // Dependency added.
    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['@astrojs/rss']).toBeDefined();
  });

  it('scaffolds an OG-card endpoint and installs astro-og-canvas when the social plugin is enabled', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: My Docs',
        'docs_dir: docs',
        'plugins:',
        '  - social',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    // Endpoint stub scaffolded at the canonical Astro file route.
    const ogPath = join(outputDir, 'src', 'pages', 'og', '[...slug].png.ts');
    expect(existsSync(ogPath)).toBe(true);
    const ogSource = readFileSync(ogPath, 'utf8');
    expect(ogSource).toContain("import { OGImageRoute } from 'astro-og-canvas'");
    expect(ogSource).toContain("await getCollection('docs')");
    expect(ogSource).toContain("'My Docs'");
    // Dependency added.
    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['astro-og-canvas']).toBeDefined();
  });

  it('does not scaffold an OG-card endpoint when the social plugin is absent', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      ['site_name: My Docs', 'docs_dir: docs', 'nav:', '  - Home: index.md', ''].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'pages', 'og', '[...slug].png.ts'))).toBe(false);
    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies['astro-og-canvas']).toBeUndefined();
  });

  it('does not scaffold an RSS endpoint when the rss plugin is absent', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      ['site_name: My Docs', 'docs_dir: docs', 'nav:', '  - Home: index.md', ''].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'pages', 'rss.xml.ts'))).toBe(false);
    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'));
    expect(pkg.dependencies).not.toHaveProperty('@astrojs/rss');
  });

  it('expands {% include %} directives when include-markdown plugin is enabled', async () => {
    mkdirSync(join(projectDir, 'docs', 'snippets'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'snippets', 'shared.md'), 'shared inline body');
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      ['# Home', '', '{% include "snippets/shared.md" %}', ''].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - include-markdown',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const indexOut = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.md'), 'utf8');
    expect(indexOut).toContain('shared inline body');
    expect(indexOut).not.toContain('{% include');
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('plugin-include-markdown-applied');
  });

  it('translates theme.palette to CSS variable overrides in the stylesheet', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  palette:',
        '    primary: pink',
        '    accent: pink',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const css = readFileSync(join(outputDir, 'src', 'styles', 'mkdocs-migration.css'), 'utf8');
    expect(css).toContain('--sl-hue-accent');
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('palette-translated');
  });

  it('extracts paired light/dark schemes from a theme.palette array', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  palette:',
        '    - media: "(prefers-color-scheme: light)"',
        '      scheme: default',
        '      primary: indigo',
        '    - media: "(prefers-color-scheme: dark)"',
        '      scheme: slate',
        '      primary: amber',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const css = readFileSync(join(outputDir, 'src', 'styles', 'mkdocs-migration.css'), 'utf8');
    // Light :root uses indigo (hue 270)
    expect(css).toMatch(/:root\s*{[\s\S]*?--sl-hue-accent:\s*270/);
    // Dark block uses amber (hue 75) — the slate scheme color
    expect(css).toMatch(/\[data-theme='dark'\]\s*{[\s\S]*?--sl-hue-accent:\s*75/);
    // Source comment reflects both schemes
    expect(css).toContain('default: indigo, slate: amber');
  });

  it('translates extra.social[] to Starlight social[] config', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'extra:',
        '  social:',
        '    - icon: fontawesome/brands/github',
        '      link: https://github.com/x/y',
        '    - icon: fontawesome/brands/discord',
        '      link: https://discord.gg/x',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain("icon: 'github'");
    expect(cfg).toContain("icon: 'discord'");
    expect(cfg).toContain('https://github.com/x/y');
  });

  it('emits editLink.baseUrl from repo_url + edit_uri', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'repo_url: https://github.com/x/y',
        'edit_uri: edit/main/docs/',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain("editLink: { baseUrl: 'https://github.com/x/y/edit/main/docs/' }");
  });

  it('translates toc extension config to tableOfContents', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'markdown_extensions:',
        '  - toc:',
        '      permalink: true',
        '      toc_depth: 4',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain('tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 4 }');
  });

  it('translates pymdownx.highlight pygments_style to a Starlight expressiveCode theme pair', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'markdown_extensions:',
        '  - pymdownx.highlight:',
        '      pygments_style: monokai',
        '      linenums: true',
        '      anchor_linenums: true',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain("expressiveCode: { themes: ['github-light', 'monokai'] }");

    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('expressive-code-theme-applied');
    expect(notes).toContain('expressive-code-options-dropped');
    expect(notes).not.toContain('expressive-code-theme-fallback');
  });

  it('emits expressive-code-theme-fallback for an unmapped Pygments style', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'markdown_extensions:',
        '  - pymdownx.highlight:',
        '      pygments_style: paraiso-dark',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain("expressiveCode: { themes: ['github-light', 'github-dark'] }");

    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('expressive-code-theme-fallback');
    expect(notes).toContain('paraiso-dark');
  });

  it('does not emit expressiveCode when pymdownx.highlight is absent', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      ['site_name: Demo', 'docs_dir: docs', 'nav:', '  - Home: index.md', ''].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).not.toContain('expressiveCode');
  });

  it('classifies theme.features into replaced-by-default vs unsupported diagnostics', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  features:',
        '    - navigation.indexes', // replaced-by-default
        '    - toc.follow', // replaced-by-default
        '    - toc.integrate', // unsupported
        '    - announce.dismiss', // unsupported
        '    - navigation.tabs', // handled-elsewhere (existing emitter)
        '    - not.a.real.feature', // unknown
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);

    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    // Replaced-by-default features get info
    expect(notes).toContain('theme-feature-replaced');
    expect(notes).toContain('navigation.indexes');
    expect(notes).toContain('toc.follow');
    // Unsupported features get warning
    expect(notes).toContain('theme-feature-unsupported');
    expect(notes).toContain('toc.integrate');
    expect(notes).toContain('announce.dismiss');
    // Unknown features surface as a separate diagnostic
    expect(notes).toContain('theme-feature-unknown');
    expect(notes).toContain('not.a.real.feature');
    // navigation.tabs is handled by the existing dedicated emitter, not the umbrella
    expect(notes).toContain('feature-navigation-tabs-recommend-topics');
  });

  it('translates theme.language to a single-locale Starlight locales block', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  language: de',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain("defaultLocale: 'root'");
    expect(cfg).toContain("root: { label: 'Deutsch', lang: 'de' }");

    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('theme-language-applied');
  });

  it('does not emit locales when theme.language is "en" (Starlight default)', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  language: en',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).not.toContain('defaultLocale');
    expect(cfg).not.toContain('locales:');
  });

  it('prefers mkdocs-static-i18n config over theme.language when both are present', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  language: de', // ignored — i18n plugin takes precedence
        'plugins:',
        '  - i18n:',
        '      languages:',
        '        - locale: en',
        '          default: true',
        '          name: English',
        '        - locale: fr',
        '          name: Français',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    // i18n plugin's `en` is the default, not theme.language's `de`
    expect(cfg).toContain("defaultLocale: 'root'");
    expect(cfg).not.toContain('Deutsch');
  });

  it('translates theme.font.{text,code} to Fontsource deps + customCss imports + CSS variable overrides', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  font:',
        '    text: Roboto',
        '    code: JetBrains Mono',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);

    const pkgJson = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkgJson.dependencies['@fontsource/roboto']).toBeDefined();
    expect(pkgJson.dependencies['@fontsource/jetbrains-mono']).toBeDefined();

    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain("'@fontsource/roboto'");
    expect(cfg).toContain("'@fontsource/jetbrains-mono'");

    const css = readFileSync(join(outputDir, 'src', 'styles', 'mkdocs-migration.css'), 'utf8');
    expect(css).toContain("--sl-font: 'Roboto'");
    expect(css).toContain("--sl-font-mono: 'JetBrains Mono'");

    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('theme-fonts-applied');
  });

  it('emits no font config when theme.font is false', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  font: false',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const pkgJson = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkgJson.dependencies).some((k) => k.startsWith('@fontsource'))).toBe(false);
  });

  it('translates extra.analytics (Google Analytics) into starlight head[] script entries', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'extra:',
        '  analytics:',
        '    provider: google',
        '    property: G-ABC12345',
        '    feedback:',
        '      title: Was this helpful?',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);

    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain('googletagmanager.com/gtag/js');
    expect(cfg).toContain('G-ABC12345');
    expect(cfg).toContain('gtag(');

    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('extra-analytics-applied');
    // feedback widget has no Starlight equivalent — separate diagnostic
    expect(notes).toContain('extra-analytics-feedback-dropped');
  });

  it('does not emit analytics head entries for unsupported providers', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'extra:',
        '  analytics:',
        '    provider: matomo',
        '    property: X',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).not.toContain('googletagmanager');
  });

  it('does not register starlight-links-validator by default (opt-in only)', async () => {
    // 2026-05-05: validator is now opt-in. Real-world Material sites link
    // to non-content paths (`/LICENSE`, `/CHANGELOG`) and dynamically-
    // generated pages (mkdocs-click, mkdocstrings). The plugin's defaults
    // reject all of these at build time. The converter's own `broken-link`
    // diagnostic catches genuine cross-content link issues during
    // conversion. See `enableLinksValidator` rationale in convert-site.ts.
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).not.toContain('starlight-links-validator');
  });

  it('registers starlight-links-validator with safe excludes when opted in', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    const result = await convertSiteFromDisk({
      projectDir,
      outputDir,
      linksValidator: true,
    });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain('starlightLinksValidator({');
    // Safe excludes for common non-content paths so the build does not
    // fail on `[License](/LICENSE)`-style links to repository-root files.
    expect(cfg).toContain("'/LICENSE'");
    expect(cfg).toContain("'/CHANGELOG'");
  });

  it('strips PyYAML !!python/... tags before YAML decode', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'markdown_extensions:',
        '  - pymdownx.emoji:',
        '      emoji_index: !!python/name:material.extensions.emoji.twemoji',
        '      emoji_generator: !!python/name:material.extensions.emoji.to_svg',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('yaml-python-tag-stripped');
  });

  it('emits Starlight <Tabs syncKey> MDX when content.tabs.link is enabled', async () => {
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      [
        '# Tabs demo',
        '',
        '=== "Bash"',
        '    Body bash.',
        '=== "Python"',
        '    Body python.',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  features:',
        '    - content.tabs.link',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'))).toBe(true);
    const mdx = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'), 'utf8');
    expect(mdx).toContain('<Tabs syncKey="');
    expect(mdx).toContain('<TabItem label="Bash">');
    expect(mdx).toContain('<TabItem label="Python">');
    expect(mdx).toContain("from '@astrojs/starlight/components'");
    expect(mdx).toMatch(/syncKey="bash-python"/);
  });

  it('emits Starlight <Tabs> MDX by default (no syncKey when content.tabs.link is absent)', async () => {
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      ['# Tabs', '', '=== "Bash"', '    body', '=== "Python"', '    body', ''].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      'site_name: Demo\ndocs_dir: docs\nnav:\n  - Home: index.md\n',
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'))).toBe(true);
    const mdx = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'), 'utf8');
    expect(mdx).toMatch(/<Tabs[\s>]/);
    expect(mdx).toContain('<TabItem label="Bash">');
    expect(mdx).toContain('<TabItem label="Python">');
    expect(mdx).not.toContain('class="sl-tabs"');
    expect(mdx).not.toMatch(/syncKey=/);
    expect(mdx).toContain("from '@astrojs/starlight/components'");
  });

  it('promotes a source file to .mdx when it contains JSX components and injects the Starlight import', async () => {
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      [
        '---',
        'title: Demo',
        '---',
        '',
        '# Hello',
        '',
        '<Aside type="tip">A tip from MDX.</Aside>',
        '',
        '<Steps>',
        '  <Card title="Step 1">First.</Card>',
        '</Steps>',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      'site_name: Demo\ndocs_dir: docs\nnav:\n  - Home: index.md\n',
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'))).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.md'))).toBe(false);
    const mdx = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'), 'utf8');
    expect(mdx).toContain("from '@astrojs/starlight/components'");
    expect(mdx).toContain('Aside');
    expect(mdx).toContain('Card');
    expect(mdx).toContain('Steps');
    expect(mdx).toContain('A tip from MDX');
    expect(mdx.startsWith('---\ntitle: Demo')).toBe(true);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('mdx-promotion');
  });

  it('keeps plain markdown content as .md (no spurious mdx promotion)', async () => {
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      '# Plain\n\nNo JSX, no imports, just markdown.\n',
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      'site_name: Demo\ndocs_dir: docs\nnav:\n  - Home: index.md\n',
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.md'))).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.mdx'))).toBe(false);
  });

  it('classifies Python hook files referenced from mkdocs.yml hooks:', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    mkdirSync(join(projectDir, 'docs', 'hooks'), { recursive: true });
    writeFileSync(
      join(projectDir, 'docs', 'hooks', 'shortcodes.py'),
      [
        'import re',
        'def on_page_markdown(markdown, **kwargs):',
        '    return re.sub(r"<!--\\s*md:version\\s*(\\S+)\\s*-->", "", markdown)',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'hooks:',
        '  - docs/hooks/shortcodes.py',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('hook-archetype-detected');
    expect(notes).toContain('shortcode-replacement');
  });

  it('infers Zod types in the auto-generated docsSchema extend block from real frontmatter', async () => {
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      [
        '---',
        'title: Home',
        'tags: [a, b]',
        'rating: 4.5',
        'reviewed: 2024-08-09',
        '---',
        '',
        'Body.',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      'site_name: Demo\ndocs_dir: docs\nnav:\n  - Home: index.md\n',
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('tags: z.array(z.string()).optional()');
    expect(notes).toContain('rating: z.number().optional()');
    expect(notes).toContain('reviewed: z.coerce.date().optional()');
  });

  it('inlines INHERIT: base config before decoding', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'base.yml'),
      ['site_description: Inherited description', ''].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'INHERIT: ./base.yml',
        'site_name: Demo',
        'docs_dir: docs',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain('Inherited description');
  });

  it('tabs: "html" forces HTML divs even when content.tabs.link is set in mkdocs.yml', async () => {
    writeFileSync(
      join(projectDir, 'docs', 'index.md'),
      ['# Tabs demo', '', '=== "A"', '    body a', '=== "B"', '    body b', ''].join('\n'),
    );
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'theme:',
        '  name: material',
        '  features:',
        '    - content.tabs.link',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir, tabs: 'html' });
    expect(result.ok).toBe(true);
    // Should produce .md (HTML), not .mdx
    expect(existsSync(join(outputDir, 'src', 'content', 'docs', 'index.md'))).toBe(true);
    const md = readFileSync(join(outputDir, 'src', 'content', 'docs', 'index.md'), 'utf8');
    expect(md).toContain('class="sl-tabs"');
    expect(md).not.toContain('<Tabs syncKey');
  });

  it('rss: false suppresses rss.xml.ts output even when rss plugin is configured', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - rss',
        'nav:',
        '  - Home: index.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir, rss: false });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'src', 'pages', 'rss.xml.ts'))).toBe(false);
  });

  it('configFormat: "ts" produces astro.config.ts instead of astro.config.mjs', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    const result = await convertSiteFromDisk({ projectDir, outputDir, configFormat: 'ts' });
    expect(result.ok).toBe(true);
    expect(existsSync(join(outputDir, 'astro.config.ts'))).toBe(true);
    expect(existsSync(join(outputDir, 'astro.config.mjs'))).toBe(false);
  });

  it('emits a wizard-decision-applied diagnostic when cards: "mdx" is passed (deferred option)', async () => {
    writeFileSync(join(projectDir, 'docs', 'index.md'), '# Home\n');
    const result = await convertSiteFromDisk({ projectDir, outputDir, cards: 'mdx' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notes = readFileSync(join(outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('wizard-decision-applied');
    expect(notes).toContain('cards');
  });

  it('emits Starlight locales config when the i18n plugin is configured', async () => {
    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: Demo',
        'docs_dir: docs',
        'plugins:',
        '  - i18n:',
        '      languages:',
        '        - locale: en',
        '          default: true',
        '          name: English',
        '        - locale: fr',
        '          name: Français',
        'nav:',
        '  - Home: index.md',
        '  - API: api/auth.md',
        '',
      ].join('\n'),
    );
    const result = await convertSiteFromDisk({ projectDir, outputDir });
    expect(result.ok).toBe(true);
    const cfg = readFileSync(join(outputDir, 'astro.config.mjs'), 'utf8');
    expect(cfg).toContain(`defaultLocale: 'root'`);
    expect(cfg).toContain('locales: {');
    expect(cfg).toContain(`root: { label: 'English'`);
    expect(cfg).toContain(`fr: { label: 'Français'`);
  });
});

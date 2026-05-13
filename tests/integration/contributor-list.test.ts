import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

let project: string;
let out: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'mk2sl-contributors-'));
  out = mkdtempSync(join(tmpdir(), 'mk2sl-contributors-out-'));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

function writeMkdocs(plugins: string): void {
  mkdirSync(join(project, 'docs'), { recursive: true });
  writeFileSync(
    join(project, 'mkdocs.yml'),
    `site_name: T\ntheme: { name: material }\nplugins:\n${plugins}\n`,
  );
  writeFileSync(join(project, 'docs', 'index.md'), '# Home\n');
}

function readGenerated(file: string): string {
  return readFileSync(join(out, file), 'utf8');
}

describe('starlight-contributor-list integration — git-authors / git-committers', () => {
  it('git-authors triggers the dependency in package.json', async () => {
    writeMkdocs('  - git-authors');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    const pkg = JSON.parse(readGenerated('package.json'));
    expect(pkg.dependencies).toHaveProperty('starlight-contributor-list');
  });

  it('pins starlight-contributor-list to ^0.4.0 (0.5.0 was never published; 0.4.0 is the last release on npm)', async () => {
    writeMkdocs('  - git-authors');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    const pkg = JSON.parse(readGenerated('package.json'));
    expect(pkg.dependencies['starlight-contributor-list']).toBe('^0.4.0');
  });

  it('git-committers triggers the dependency in package.json', async () => {
    writeMkdocs('  - git-committers');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    const pkg = JSON.parse(readGenerated('package.json'));
    expect(pkg.dependencies).toHaveProperty('starlight-contributor-list');
  });

  it('emits the integration import + invocation in astro.config.mjs', async () => {
    writeMkdocs('  - git-authors');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    const cfg = readGenerated('astro.config.mjs');
    expect(cfg).toContain("import starlightContributorList from 'starlight-contributor-list';");
    expect(cfg).toContain('starlightContributorList({ list: [] })');
    // Placeholder TODO must precede the call so users see it during review.
    expect(cfg).toMatch(/TODO[^\n]*contributors[\s\S]*starlightContributorList/);
  });

  it('git-authors AND git-committers together register only ONE starlight-contributor-list dep', async () => {
    writeMkdocs('  - git-authors\n  - git-committers');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    const pkg = JSON.parse(readGenerated('package.json'));
    const matches = Object.keys(pkg.dependencies).filter((k) => k === 'starlight-contributor-list');
    expect(matches).toHaveLength(1);

    // And the integration block appears exactly once.
    const cfg = readGenerated('astro.config.mjs');
    const occurrences = cfg.match(/starlightContributorList\(/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('emits the auto-wired diagnostic message in migration notes', async () => {
    writeMkdocs('  - git-authors');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Plugin-level diagnostics surface in MIGRATION_NOTES.md, not the
    // per-file diagnostics array.
    expect(result.value.migrationNotesSource).toContain('plugin-git-authors-mapped');
    expect(result.value.migrationNotesSource).toContain('auto-wired');
    expect(result.value.migrationNotesSource).toContain('starlight-contributor-list');
  });

  it('a project WITHOUT git-authors/committers does not pull in the dep', async () => {
    writeMkdocs('  - search');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);

    const pkg = JSON.parse(readGenerated('package.json'));
    expect(pkg.dependencies).not.toHaveProperty('starlight-contributor-list');

    const cfg = readGenerated('astro.config.mjs');
    expect(cfg).not.toContain('starlight-contributor-list');
    expect(cfg).not.toContain('starlightContributorList');
  });
});

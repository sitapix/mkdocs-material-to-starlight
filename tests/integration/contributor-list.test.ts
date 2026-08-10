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

describe('git contributor plugin migration guidance', () => {
  it.each(['git-authors', 'git-committers'])(
    'does not install the deprecated contributor package for %s',
    async (plugin) => {
      writeMkdocs(`  - ${plugin}`);

      const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
      expect(result.ok).toBe(true);

      const pkg = JSON.parse(readGenerated('package.json'));
      expect(pkg.dependencies).not.toHaveProperty('starlight-contributor-list');
      const cfg = readGenerated('astro.config.mjs');
      expect(cfg).not.toContain('starlight-contributor-list');
      expect(cfg).not.toContain('starlightContributorList');
    },
  );

  it('emits actionable manual migration guidance instead of an empty placeholder', async () => {
    writeMkdocs('  - git-authors');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.migrationNotesSource).toContain('plugin-git-authors-mapped');
    expect(result.value.migrationNotesSource).toContain('No package was installed');
    expect(result.value.migrationNotesSource).toContain('deprecated');
    expect(result.value.migrationNotesSource).toContain('component override');
    expect(result.value.migrationNotesSource).not.toContain('auto-wired');
  });

  it('reports both source plugins without adding a generated dependency', async () => {
    writeMkdocs('  - git-authors\n  - git-committers');

    const result = await convertSiteFromDisk({ projectDir: project, outputDir: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pkg = JSON.parse(readGenerated('package.json'));
    expect(pkg.dependencies).not.toHaveProperty('starlight-contributor-list');
    const notes = result.value.migrationNotesSource;
    expect(notes).toContain('mkdocs-git-authors-plugin');
    expect(notes).toContain('mkdocs-git-committers-2');
  });
});

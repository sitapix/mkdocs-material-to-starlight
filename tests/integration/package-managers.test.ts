import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convertSiteFromDisk } from '../../src/interface/api/convert-site.js';

describe('package-manager tabs (integration)', () => {
  let projectDir: string;
  let outputDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'mts-pm-proj-'));
    outputDir = mkdtempSync(join(tmpdir(), 'mts-pm-out-'));

    mkdirSync(join(projectDir, 'docs'), { recursive: true });

    writeFileSync(
      join(projectDir, 'mkdocs.yml'),
      [
        'site_name: PM Test',
        'docs_dir: docs',
        'markdown_extensions:',
        '  - pymdownx.tabbed:',
        '      alternate_style: true',
        '  - pymdownx.superfences',
        '',
      ].join('\n'),
    );

    // A page with npm/yarn/pnpm/bun tabs containing install commands.
    writeFileSync(
      join(projectDir, 'docs', 'install.md'),
      [
        '# Installation',
        '',
        '=== "npm"',
        '    npm install my-cool-lib',
        '',
        '=== "yarn"',
        '    yarn add my-cool-lib',
        '',
        '=== "pnpm"',
        '    pnpm add my-cool-lib',
        '',
        '=== "bun"',
        '    bun add my-cool-lib',
        '',
        'Some text after the tabs.',
        '',
      ].join('\n'),
    );
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('keeps npm/yarn/pnpm/bun commands as native Starlight tabs', async () => {
    const result = await convertSiteFromDisk({ projectDir, outputDir, force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Native Starlight tabs still require MDX, but no community import.
    const outPath = join(outputDir, 'src', 'content', 'docs', 'install.mdx');
    const content = readFileSync(outPath, 'utf8');

    // 1. The file is .mdx.
    expect(content).toBeTruthy();

    expect(content).not.toContain('starlight-package-managers');
    expect(content).toContain('<Tabs');
    expect(content).toContain('<TabItem label="npm">');
    expect(content).toContain('npm install my-cool-lib');

    const pmDiag = result.value.diagnostics.find(
      (d) => d.diagnostic.ruleId === 'package-managers-tabs-recommended',
    );
    expect(pmDiag).toBeTruthy();
    expect(pmDiag?.diagnostic.severity).toBe('info');
    expect(pmDiag?.sourcePath).toBe('install.md');
  });

  it('does not install starlight-package-managers', async () => {
    const result = await convertSiteFromDisk({ projectDir, outputDir, force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const pkg = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['starlight-package-managers']).toBeUndefined();
  });
});

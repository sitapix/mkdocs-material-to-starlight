import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyThemeAssetCopies, type ThemeAssetCopyInput } from './apply-theme-asset-copies.js';

const created: string[] = [];

async function workspace(): Promise<{ docsDir: string; outputDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'mkdocs-starlight-assets-'));
  created.push(root);
  const docsDir = join(root, 'docs');
  const outputDir = join(root, 'out');
  await Promise.all([mkdir(docsDir), mkdir(outputDir)]);
  return { docsDir, outputDir };
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function input(
  dirs: { docsDir: string; outputDir: string },
  overrides: Partial<ThemeAssetCopyInput> = {},
): ThemeAssetCopyInput {
  return {
    ...dirs,
    logoSrc: null,
    faviconRaw: null,
    faviconRawCandidate: null,
    faviconExtensionRejected: false,
    migrationNotesSource: '# Migration notes\n',
    ...overrides,
  };
}

describe('applyThemeAssetCopies', () => {
  it('does nothing when no theme assets or diagnostics are present', async () => {
    const dirs = await workspace();
    await applyThemeAssetCopies(input(dirs));

    await expect(readFile(join(dirs.outputDir, 'MIGRATION_NOTES.md'), 'utf8')).rejects.toThrow();
  });

  it('copies valid logo and favicon assets to their generated locations', async () => {
    const dirs = await workspace();
    await writeFile(join(dirs.docsDir, 'logo.svg'), '<svg/>', { encoding: 'utf8', flag: 'w' });
    await writeFile(join(dirs.docsDir, 'favicon.png'), 'png', { encoding: 'utf8', flag: 'w' });

    await applyThemeAssetCopies(input(dirs, { logoSrc: 'logo.svg', faviconRaw: 'favicon.png' }));

    await expect(readFile(join(dirs.outputDir, 'src/assets/logo.svg'), 'utf8')).resolves.toBe(
      '<svg/>',
    );
    await expect(readFile(join(dirs.outputDir, 'public/favicon.png'), 'utf8')).resolves.toBe('png');
  });

  it('appends diagnostics for rejected and missing theme assets', async () => {
    const dirs = await workspace();
    await applyThemeAssetCopies(
      input(dirs, {
        logoSrc: 'missing-logo.svg',
        faviconRaw: 'missing-favicon.png',
        faviconRawCandidate: 'favicon.webp',
        faviconExtensionRejected: true,
      }),
    );

    const notes = await readFile(join(dirs.outputDir, 'MIGRATION_NOTES.md'), 'utf8');
    expect(notes).toContain('favicon-extension-unsupported');
    expect(notes).toContain('logo-source-missing');
    expect(notes).toContain('favicon-source-missing');
    expect(notes).toContain('favicon.webp');
  });
});

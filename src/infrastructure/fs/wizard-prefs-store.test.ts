import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeWizardPrefsStore } from './wizard-prefs-store.js';

const created: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'mkdocs-starlight-prefs-'));
  created.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('createNodeWizardPrefsStore', () => {
  it('round-trips preferences using the versioned JSON shape', async () => {
    const projectDir = await temporaryDirectory();
    const store = createNodeWizardPrefsStore();
    const prefs = { version: 1 as const, flags: ['./docs', './out', '--force'] };

    await expect(store.write(projectDir, prefs)).resolves.toEqual({ ok: true, value: undefined });
    await expect(store.read(projectDir)).resolves.toEqual({ ok: true, value: prefs });
    await expect(
      readFile(join(projectDir, '.mkdocs-material-to-starlight.json'), 'utf8'),
    ).resolves.toBe(`${JSON.stringify(prefs, null, 2)}\n`);
  });

  it('treats an absent preferences file as a normal first run', async () => {
    const projectDir = await temporaryDirectory();
    const store = createNodeWizardPrefsStore();

    await expect(store.read(projectDir)).resolves.toEqual({ ok: true, value: null });
  });

  it('reports filesystem read and write failures without throwing', async () => {
    const projectDir = await temporaryDirectory();
    const notADirectory = join(projectDir, 'file');
    await writeFile(notADirectory, 'occupied', 'utf8');
    const store = createNodeWizardPrefsStore();

    const read = await store.read(notADirectory);
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.error.code).toBe('read-failed');
      expect(read.error.message).toContain('.mkdocs-material-to-starlight.json');
    }

    const write = await store.write(notADirectory, { version: 1, flags: [] });
    expect(write.ok).toBe(false);
    if (!write.ok) {
      expect(write.error.code).toBe('write-failed');
      expect(write.error.message).toContain('.mkdocs-material-to-starlight.json');
    }
  });

  it('rejects invalid JSON', async () => {
    const projectDir = await temporaryDirectory();
    await writeFile(join(projectDir, '.mkdocs-material-to-starlight.json'), '{', 'utf8');

    const result = await createNodeWizardPrefsStore().read(projectDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('malformed');
      expect(result.error.message).toContain('is not valid JSON');
    }
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['the wrong version', { version: 2, flags: [] }],
    ['non-array flags', { version: 1, flags: 'convert' }],
    ['non-string flags', { version: 1, flags: [1] }],
  ])('rejects %s as an invalid preferences shape', async (_label, value) => {
    const projectDir = await temporaryDirectory();
    await writeFile(
      join(projectDir, '.mkdocs-material-to-starlight.json'),
      JSON.stringify(value),
      'utf8',
    );

    const result = await createNodeWizardPrefsStore().read(projectDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('malformed');
      expect(result.error.message).toContain('does not match the expected shape');
    }
  });
});

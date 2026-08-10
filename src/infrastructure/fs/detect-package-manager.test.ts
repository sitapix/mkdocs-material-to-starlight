import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectRepositoryPackageManager } from './detect-package-manager.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<{ root: string; nested: string }> {
  const root = await mkdtemp(join(tmpdir(), 'mts-package-manager-'));
  roots.push(root);
  const nested = join(root, 'docs', 'starlight');
  await mkdir(nested, { recursive: true });
  return { root, nested };
}

describe('detectRepositoryPackageManager', () => {
  it('uses the closest parent packageManager declaration', async () => {
    const { root, nested } = await workspace();
    await writeFile(join(root, 'package.json'), '{"packageManager":"yarn@4.9.2"}\n');

    await expect(detectRepositoryPackageManager(nested)).resolves.toBe('yarn');
  });

  it.each([
    ['yarn.lock', 'yarn'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['package-lock.json', 'npm'],
    ['bun.lock', 'bun'],
  ] as const)('detects %s in a parent repository', async (lockfile, expected) => {
    const { root, nested } = await workspace();
    await writeFile(join(root, lockfile), '');

    await expect(detectRepositoryPackageManager(nested)).resolves.toBe(expected);
  });

  it('prefers packageManager over conflicting lockfiles', async () => {
    const { root, nested } = await workspace();
    await Promise.all([
      writeFile(join(root, 'package.json'), '{"packageManager":"yarn@4.9.2"}\n'),
      writeFile(join(root, 'package-lock.json'), '{}\n'),
    ]);

    await expect(detectRepositoryPackageManager(nested)).resolves.toBe('yarn');
  });

  it('returns null for ambiguous lockfiles', async () => {
    const { root, nested } = await workspace();
    await Promise.all([
      writeFile(join(root, 'yarn.lock'), ''),
      writeFile(join(root, 'package-lock.json'), '{}\n'),
    ]);

    await expect(detectRepositoryPackageManager(nested)).resolves.toBeNull();
  });
});

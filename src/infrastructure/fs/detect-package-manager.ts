import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { PackageManager } from '../../domain/wizard/answers.js';

const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['yarn.lock', 'yarn'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
];

/** Find the package manager declared by the closest project or parent repo. */
export async function detectRepositoryPackageManager(
  startDir: string,
): Promise<PackageManager | null> {
  let directory = resolve(startDir);

  while (true) {
    const manifestManager = await readManifestPackageManager(join(directory, 'package.json'));
    if (manifestManager !== null) return manifestManager;

    const lockfileManagers = new Set<PackageManager>();
    await Promise.all(
      LOCKFILES.map(async ([filename, manager]) => {
        try {
          await access(join(directory, filename));
          lockfileManagers.add(manager);
        } catch {
          // Missing or unreadable lockfiles provide no signal.
        }
      }),
    );
    if (lockfileManagers.size === 1) return [...lockfileManagers][0] ?? null;
    if (lockfileManagers.size > 1) return null;

    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

async function readManifestPackageManager(path: string): Promise<PackageManager | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as {
      readonly packageManager?: unknown;
      readonly devEngines?: {
        readonly packageManager?: { readonly name?: unknown };
      };
    };
    const declared = parsePackageManagerName(parsed.packageManager);
    if (declared !== null) return declared;
    return parsePackageManagerName(parsed.devEngines?.packageManager?.name);
  } catch {
    return null;
  }
}

function parsePackageManagerName(value: unknown): PackageManager | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(npm|pnpm|yarn|bun)(?:@|$)/);
  return (match?.[1] as PackageManager | undefined) ?? null;
}

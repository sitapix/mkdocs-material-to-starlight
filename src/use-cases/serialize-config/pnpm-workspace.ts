/**
 * Emit the minimal pnpm 11 project policy required by Astro's toolchain.
 *
 * pnpm blocks unreviewed dependency build scripts by default. Astro depends on
 * esbuild, whose install script selects the correct platform binary. Approve
 * that one package explicitly instead of disabling pnpm's safety policy.
 */
export function serializePnpmWorkspace(): string {
  return 'allowBuilds:\n  esbuild: true\n';
}

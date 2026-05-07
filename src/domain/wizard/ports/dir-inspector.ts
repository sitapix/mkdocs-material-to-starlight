/**
 * Port for filesystem state queries used by the wizard. Kept narrow:
 * the wizard only ever needs to know whether a target directory would
 * be clobbered. A richer fs-port lives elsewhere; this exists so the
 * `confirmOverwriteIfNeeded` use-case stays testable with a tiny fake.
 *
 * `astro-project` is a non-empty directory that looks like an existing
 * Astro/Starlight site (`astro.config.{mjs,ts,js}` at the root and a
 * `src/content/docs/` tree). It exists as a distinct state so the wizard
 * can warn more loudly: the user is about to overwrite real working code,
 * not just an empty scratch dir.
 */

export type DirState = 'missing' | 'empty' | 'non-empty' | 'astro-project';

export interface DirInspector {
  inspect(path: string): Promise<DirState>;
}

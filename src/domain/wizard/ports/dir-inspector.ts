/**
 * Port for filesystem state queries used by the wizard. Kept narrow:
 * the wizard only ever needs to know whether a target directory would
 * be clobbered. A richer fs-port lives elsewhere; this exists so the
 * `confirmOverwriteIfNeeded` use-case stays testable with a tiny fake.
 */

export type DirState = 'missing' | 'empty' | 'non-empty';

export interface DirInspector {
  inspect(path: string): Promise<DirState>;
}

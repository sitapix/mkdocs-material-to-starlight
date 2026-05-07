/**
 * Append `--force` to a flag list when it isn't already present.
 *
 * Used by the wizard's saved-prefs replay path. If the user re-runs against a
 * non-empty output directory and confirms the overwrite prompt, we have to
 * pass `--force` to the converter — but the saved flags may or may not
 * already include it. Idempotent: calling twice doesn't double-append.
 */

export function withForceFlag(flags: ReadonlyArray<string>): ReadonlyArray<string> {
  const hasForce = flags.some((f) => f === '--force' || f.startsWith('--force='));
  return hasForce ? flags : [...flags, '--force'];
}

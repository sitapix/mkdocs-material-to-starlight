/**
 * Persistence port for the wizard's per-project answer memory.
 *
 * Stores the equivalent CLI flags from the most recent successful run, keyed
 * to the project directory (`.mkdocs-material-to-starlight.json`). On the
 * next run, the wizard can offer to pre-fill defaults from these flags so
 * users iterating on a config don't re-answer twelve prompts each time.
 *
 * Why flags (not answers): the CLI flag list is the project's stable
 * contract — `parseArgs` accepts it unchanged. Persisting `WizardAnswers`
 * directly would couple disk shape to internal types and break on every
 * field rename. Persisting flags is schema-stable as long as `--help` is.
 *
 * Failures are returned, never thrown. This is best-effort persistence:
 * if a read or write fails (permission, disk full), the wizard continues
 * — never blocks on missing prefs.
 */

import type { Result } from '../../result.js';

export interface WizardPrefsStoreError {
  readonly code: 'read-failed' | 'write-failed' | 'malformed';
  readonly message: string;
}

export interface WizardPrefs {
  /** Schema version. Bumped when the on-disk shape changes incompatibly. */
  readonly version: 1;
  /**
   * The flag array as it would be passed to the CLI (`./project`, `./out`,
   * `--package-manager=pnpm`, …). Order is significant; positionals come
   * first, options after.
   */
  readonly flags: ReadonlyArray<string>;
}

export interface WizardPrefsStore {
  /**
   * Load saved prefs for the project. Returns `null` (wrapped in `ok`) when
   * no prefs file exists — that's the common first-run case, not an error.
   */
  read(projectDir: string): Promise<Result<WizardPrefs | null, WizardPrefsStoreError>>;
  /**
   * Save prefs for the project. Best-effort: callers should log and continue
   * on failure rather than aborting the success path.
   */
  write(projectDir: string, prefs: WizardPrefs): Promise<Result<undefined, WizardPrefsStoreError>>;
}

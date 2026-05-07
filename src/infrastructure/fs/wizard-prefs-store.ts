/**
 * Node fs adapter for the WizardPrefsStore port.
 *
 * Stores the equivalent CLI flags from the most recent successful wizard
 * run as `<projectDir>/.mkdocs-material-to-starlight.json`. Versioned so a
 * future schema change can be detected and either migrated or ignored.
 *
 * On read: missing file is `ok(null)`, NOT an error — it's the common
 * first-run case. Permission/access errors propagate as `read-failed`;
 * malformed JSON or wrong shape propagates as `malformed`. The wizard's
 * `restorePrefs` use-case treats any error as "no prefs" and silently
 * proceeds, so even a corrupt file never blocks the user.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  WizardPrefs,
  WizardPrefsStore,
  WizardPrefsStoreError,
} from '../../domain/wizard/ports/wizard-prefs-store.js';
import { err, ok, type Result } from '../../domain/result.js';
import { atomicWriteText } from './atomic-write.js';

const PREFS_FILE = '.mkdocs-material-to-starlight.json';

export function createNodeWizardPrefsStore(): WizardPrefsStore {
  return {
    async read(projectDir: string): Promise<Result<WizardPrefs | null, WizardPrefsStoreError>> {
      const path = join(projectDir, PREFS_FILE);
      let raw: string;
      try {
        raw = await readFile(path, 'utf8');
      } catch (cause) {
        if (isNodeNotFound(cause)) return ok(null);
        return err({
          code: 'read-failed',
          message: `could not read ${path}: ${formatCause(cause)}`,
        });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        return err({
          code: 'malformed',
          message: `${path} is not valid JSON: ${formatCause(cause)}`,
        });
      }
      if (!isWizardPrefs(parsed)) {
        return err({
          code: 'malformed',
          message: `${path} does not match the expected shape (\`{ version: 1, flags: string[] }\`).`,
        });
      }
      return ok(parsed);
    },
    async write(
      projectDir: string,
      prefs: WizardPrefs,
    ): Promise<Result<undefined, WizardPrefsStoreError>> {
      const path = join(projectDir, PREFS_FILE);
      const wrote = await atomicWriteText(path, `${JSON.stringify(prefs, null, 2)}\n`);
      if (!wrote.ok) {
        return err({ code: 'write-failed', message: wrote.error });
      }
      return ok(undefined);
    },
  };
}

function isNodeNotFound(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    (cause as { code: unknown }).code === 'ENOENT'
  );
}

function formatCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

function isWizardPrefs(value: unknown): value is WizardPrefs {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) return false;
  if (!Array.isArray(obj.flags)) return false;
  return obj.flags.every((f) => typeof f === 'string');
}

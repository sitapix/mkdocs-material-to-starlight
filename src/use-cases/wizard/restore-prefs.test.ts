import { describe, expect, it } from 'vitest';
import { err, ok } from '../../domain/result.js';
import type {
  WizardPrefs,
  WizardPrefsStore,
} from '../../domain/wizard/ports/wizard-prefs-store.js';
import { createFakePrompter } from './fake-prompter.js';
import { restorePrefs } from './restore-prefs.js';

function fakeStore(saved: WizardPrefs | null): WizardPrefsStore {
  return {
    read: async () => ok(saved),
    write: async () => ok(undefined),
  };
}

function failingReadStore(): WizardPrefsStore {
  return {
    read: async () => err({ code: 'read-failed' as const, message: 'permission denied' }),
    write: async () => ok(undefined),
  };
}

describe('restorePrefs', () => {
  it('returns null when no prefs file exists (first-run case)', async () => {
    const prompter = createFakePrompter();
    const result = await restorePrefs(prompter, fakeStore(null), '/p');
    expect(result).toBeNull();
    // Must not prompt the user when there's nothing to restore.
    expect(prompter.calls.length).toBe(0);
  });

  it('returns the saved flags when the user accepts the restore prompt', async () => {
    const prompter = createFakePrompter({ confirm: [true] });
    const result = await restorePrefs(
      prompter,
      fakeStore({ version: 1, flags: ['./p', './o', '--package-manager=pnpm'] }),
      '/p',
    );
    expect(result).toEqual(['./p', './o', '--package-manager=pnpm']);
  });

  it('returns null when the user declines the restore prompt', async () => {
    const prompter = createFakePrompter({ confirm: [false] });
    const result = await restorePrefs(
      prompter,
      fakeStore({ version: 1, flags: ['./p', './o'] }),
      '/p',
    );
    expect(result).toBeNull();
  });

  it('returns null when the user cancels at the restore prompt (Ctrl+C)', async () => {
    const prompter = createFakePrompter({ confirm: [null] });
    const result = await restorePrefs(
      prompter,
      fakeStore({ version: 1, flags: ['./p', './o'] }),
      '/p',
    );
    expect(result).toBeNull();
  });

  it('treats read failures as "no prefs" and silently proceeds (best-effort persistence)', async () => {
    const prompter = createFakePrompter();
    const result = await restorePrefs(prompter, failingReadStore(), '/p');
    expect(result).toBeNull();
    // Must not prompt the user; must not throw. A broken prefs file should
    // never block the wizard — just degrade to no-prefs behavior.
    expect(prompter.calls.length).toBe(0);
  });
});

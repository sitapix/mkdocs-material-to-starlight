import { describe, expect, it } from 'vitest';
import type { DirInspector, DirState } from '../../domain/wizard/ports/dir-inspector.js';
import { confirmOverwriteIfNeeded } from './confirm-overwrite.js';
import { createFakePrompter } from './fake-prompter.js';

function fakeInspector(state: DirState): DirInspector {
  return { inspect: async () => state };
}

describe('confirmOverwriteIfNeeded', () => {
  it('returns "no-need" when the target directory is missing — no prompt fires', async () => {
    const prompter = createFakePrompter();
    const result = await confirmOverwriteIfNeeded(
      prompter,
      fakeInspector('missing'),
      '/does/not/exist',
    );
    expect(result).toBe('no-need');
    expect(prompter.calls.length).toBe(0);
    expect(prompter.logs.length).toBe(0);
  });

  it('returns "no-need" when the target directory is empty — no prompt fires', async () => {
    const prompter = createFakePrompter();
    const result = await confirmOverwriteIfNeeded(prompter, fakeInspector('empty'), '/empty');
    expect(result).toBe('no-need');
    expect(prompter.calls.length).toBe(0);
  });

  it('warns and confirms when target is non-empty; returns "confirmed" when user accepts', async () => {
    const prompter = createFakePrompter({ confirm: [true] });
    const result = await confirmOverwriteIfNeeded(
      prompter,
      fakeInspector('non-empty'),
      '/already/here',
    );
    expect(result).toBe('confirmed');
    // The prompter must have surfaced a warning message that mentions the path
    // (so the user knows exactly what they're agreeing to overwrite) before
    // the confirmation prompt fired.
    expect(
      prompter.logs.some((l) => l.level === 'warn' && l.message.includes('/already/here')),
    ).toBe(true);
    expect(prompter.calls.find((c) => c.kind === 'confirm')).toBeDefined();
  });

  it('returns "cancelled" when the user declines overwrite', async () => {
    const prompter = createFakePrompter({ confirm: [false] });
    const result = await confirmOverwriteIfNeeded(prompter, fakeInspector('non-empty'), '/here');
    expect(result).toBe('cancelled');
  });

  it('returns "cancelled" when the user hits Ctrl+C at the confirm prompt', async () => {
    const prompter = createFakePrompter({ confirm: [null] });
    const result = await confirmOverwriteIfNeeded(prompter, fakeInspector('non-empty'), '/here');
    expect(result).toBe('cancelled');
  });

  it('escalates the warning when the target is an existing Astro/Starlight project', async () => {
    const prompter = createFakePrompter({ confirm: [false] });
    await confirmOverwriteIfNeeded(prompter, fakeInspector('astro-project'), '/existing/site');
    // The user is about to clobber a real Astro project; the warning must
    // call that out specifically (more than just "non-empty"), and reference
    // the path so they know what they're trampling.
    const warn = prompter.logs.find((l) => l.level === 'warn');
    expect(warn).toBeDefined();
    expect(warn?.message).toContain('/existing/site');
    expect(warn?.message.toLowerCase()).toMatch(/astro|starlight/);
  });

  it('confirm prompt defaults to NO so an inattentive Enter does not destroy data', async () => {
    let observed: { initialValue?: boolean } | undefined;
    const wrapped = createFakePrompter({ confirm: [false] });
    const realConfirm = wrapped.confirm.bind(wrapped);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wrapped as any).confirm = async (o: any) => {
      observed = o;
      return realConfirm(o);
    };
    await confirmOverwriteIfNeeded(wrapped, fakeInspector('non-empty'), '/x');
    expect(observed?.initialValue).toBe(false);
  });
});

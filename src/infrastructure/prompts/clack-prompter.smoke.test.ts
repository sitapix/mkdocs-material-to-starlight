import { describe, expect, it, vi } from 'vitest';
import { createClackPrompter } from './clack-prompter.js';

vi.mock('@clack/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@clack/prompts')>();
  return {
    ...actual,
    note: vi.fn(),
  };
});

describe('createClackPrompter', () => {
  it('returns an object implementing every Prompter method', () => {
    const p = createClackPrompter();
    expect(typeof p.intro).toBe('function');
    expect(typeof p.outro).toBe('function');
    expect(typeof p.cancel).toBe('function');
    expect(typeof p.note).toBe('function');
    expect(typeof p.text).toBe('function');
    expect(typeof p.confirm).toBe('function');
    expect(typeof p.select).toBe('function');
    expect(typeof p.multiselect).toBe('function');
  });

  it('passes a non-dimming format to clack note() so body stays full-brightness', async () => {
    // clack 1.3.0 defaults the note formatter to `pc.dim(line)`, which makes
    // boxed bodies wash out next to the surrounding log.step lines. We
    // override with an identity formatter so picocolors styling on the
    // content (bold-cyan names, underlined-cyan URLs) survives.
    const { note } = await import('@clack/prompts');
    const p = createClackPrompter();
    p.note('hello world', 'A title');

    const mocked = vi.mocked(note);
    expect(mocked).toHaveBeenCalledTimes(1);
    const opts = mocked.mock.calls[0]?.[2];
    expect(typeof opts?.format).toBe('function');
    // Identity (or any non-dimming function) is acceptable; what matters is
    // that the formatter does NOT inject the SGR-dim sequence (\x1b[2m).
    const sample = 'plain text';
    const formatted = opts?.format?.(sample) ?? '';
    expect(formatted).not.toMatch(/\x1b\[2m/);
  });

  it('exposes a Logger with all five severity methods (no-color-only signal)', () => {
    const p = createClackPrompter();
    expect(typeof p.log.info).toBe('function');
    expect(typeof p.log.success).toBe('function');
    expect(typeof p.log.step).toBe('function');
    expect(typeof p.log.warn).toBe('function');
    expect(typeof p.log.error).toBe('function');
  });
});

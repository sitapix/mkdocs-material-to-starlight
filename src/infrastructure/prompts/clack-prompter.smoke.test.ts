import { describe, expect, it } from 'vitest';
import { createClackPrompter } from './clack-prompter.js';

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

  it('exposes a Logger with all five severity methods (no-color-only signal)', () => {
    const p = createClackPrompter();
    expect(typeof p.log.info).toBe('function');
    expect(typeof p.log.success).toBe('function');
    expect(typeof p.log.step).toBe('function');
    expect(typeof p.log.warn).toBe('function');
    expect(typeof p.log.error).toBe('function');
  });
});

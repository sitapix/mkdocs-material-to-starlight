import { describe, expect, it } from 'vitest';
import { createPixelmatchDiffer } from './pixelmatch-differ.js';

describe('createPixelmatchDiffer', () => {
  it('returns a driver-missing error when pixelmatch + pngjs are not installed', async () => {
    const differ = createPixelmatchDiffer();
    const result = await differ.diff(new Uint8Array([1]), new Uint8Array([2]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Either the modules are missing (driver-missing), or they're somehow
      // installed and we hit invalid-png from the stub bytes — both are
      // acceptable as long as we never throw.
      expect(['driver-missing', 'invalid-png']).toContain(result.error.code);
      if (result.error.code === 'driver-missing') {
        expect(result.error.message).toMatch(/pixelmatch|pngjs/);
      }
    }
  });
});

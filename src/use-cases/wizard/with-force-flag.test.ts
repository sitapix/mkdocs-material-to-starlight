import { describe, expect, it } from 'vitest';
import { withForceFlag } from './with-force-flag.js';

describe('withForceFlag', () => {
  it('appends --force when missing', () => {
    expect(withForceFlag(['./p', './o', '--check'])).toEqual(['./p', './o', '--check', '--force']);
  });

  it('returns flags unchanged when --force is already present', () => {
    const flags = ['./p', './o', '--force', '--check'];
    expect(withForceFlag(flags)).toEqual(flags);
  });

  it('detects --force when in =value form (non-applicable today, but future-proof)', () => {
    // --force is a boolean flag with no value; this guards against accidental
    // double-append if a future contributor types `--force=true`.
    const flags = ['./p', './o', '--force=true'];
    expect(withForceFlag(flags)).toEqual(flags);
  });
});

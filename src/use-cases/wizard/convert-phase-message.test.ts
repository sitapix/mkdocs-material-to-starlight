import { describe, expect, it } from 'vitest';
import { convertPhaseMessage } from './convert-phase-message.js';

describe('convertPhaseMessage', () => {
  it('starts on the file-walk phase', () => {
    expect(convertPhaseMessage(0, { withAstroCheck: false })).toMatch(/walking files/i);
    expect(convertPhaseMessage(2_000, { withAstroCheck: false })).toMatch(/walking files/i);
  });

  it('moves to the transform phase after a few seconds', () => {
    expect(convertPhaseMessage(8_000, { withAstroCheck: false })).toMatch(/transform/i);
  });

  it('moves to writing-output phase before astro check', () => {
    expect(convertPhaseMessage(20_000, { withAstroCheck: false })).toMatch(/writ/i);
  });

  it('mentions astro check past the early phases when --check is on', () => {
    const msg = convertPhaseMessage(45_000, { withAstroCheck: true });
    expect(msg).toMatch(/astro check/i);
  });

  it('reassures the user past 90s that multi-minute waits are expected', () => {
    // Without this reassurance the spinner reads as a hang on first --check
    // runs (observed: ~5 min). The reassurance message keeps astro check
    // named so the user knows what they're waiting on.
    const msg = convertPhaseMessage(180_000, { withAstroCheck: true });
    expect(msg).toMatch(/astro check/i);
    expect(msg).toMatch(/minute/i);
  });

  it('does not mention astro check when --check is off', () => {
    const msg = convertPhaseMessage(45_000, { withAstroCheck: false });
    expect(msg).not.toMatch(/astro check/i);
  });

  it('returns a stable string at very large elapsed times (no crash, no empty)', () => {
    const msg = convertPhaseMessage(10 * 60_000, { withAstroCheck: true });
    expect(msg.length).toBeGreaterThan(0);
  });
});

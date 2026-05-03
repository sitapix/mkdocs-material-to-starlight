import { describe, expect, it } from 'vitest';
import { createPlaywrightAutomator } from './playwright-automator.js';

describe('createPlaywrightAutomator', () => {
  it('returns a driver-missing error when Playwright is not installed', async () => {
    const automator = createPlaywrightAutomator();
    const result = await automator.capture('http://localhost', {
      width: 1280,
      height: 800,
      timeoutMs: 1000,
      fullPage: false,
    });
    // Playwright is intentionally NOT a hard dep. The adapter must fail
    // gracefully with a typed error and an installation hint.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['driver-missing', 'navigation-failed']).toContain(result.error.code);
      if (result.error.code === 'driver-missing') {
        expect(result.error.message).toMatch(/playwright/i);
      }
    }
  });
});

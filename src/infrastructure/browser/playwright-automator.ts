/**
 * Production adapter for the `BrowserAutomator` port using Playwright.
 *
 * Playwright (and its 600MB+ browser binaries) is not a hard dependency of
 * this package. The adapter `import()`s it dynamically the first time
 * `capture` is called; if the module isn't installed, the adapter returns a
 * typed `driver-missing` error that the CLI surfaces with installation
 * instructions.
 *
 * This pattern keeps the converter usable for users who only want the
 * Markdown→Markdown half and don't need visual-diff. Users who do want
 * compare run:
 *
 *   npm install playwright
 *   npx playwright install chromium
 *
 * once, and the adapter starts working.
 */

import { ok, err, type Result } from '../../domain/result.js';
import type {
  BrowserAutomator,
  BrowserAutomatorError,
  CaptureOptions,
} from '../../domain/ports/browser-automator.js';

interface PlaywrightChromiumModule {
  readonly chromium: {
    launch(options?: { headless?: boolean }): Promise<PlaywrightBrowser>;
  };
}

interface PlaywrightBrowser {
  newContext(options: {
    viewport: { width: number; height: number };
  }): Promise<PlaywrightContext>;
  close(): Promise<void>;
}

interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
}

interface PlaywrightPage {
  goto(
    url: string,
    options: { timeout: number; waitUntil: 'load' | 'networkidle' },
  ): Promise<unknown>;
  screenshot(options: { fullPage: boolean; type: 'png' }): Promise<Uint8Array>;
}

const INSTALL_HINT =
  'install Playwright to use the visual-diff feature: `npm install playwright && npx playwright install chromium`';

export function createPlaywrightAutomator(): BrowserAutomator {
  let browserPromise: Promise<PlaywrightBrowser | null> | null = null;

  async function getBrowser(): Promise<PlaywrightBrowser | null> {
    if (browserPromise === null) {
      browserPromise = launchOrNull();
    }
    return browserPromise;
  }

  return {
    async capture(
      url: string,
      options: CaptureOptions,
    ): Promise<Result<Uint8Array, BrowserAutomatorError>> {
      const browser = await getBrowser();
      if (browser === null) {
        return err({
          code: 'driver-missing',
          url,
          message: INSTALL_HINT,
        });
      }
      try {
        const context = await browser.newContext({
          viewport: { width: options.width, height: options.height },
        });
        const page = await context.newPage();
        await page.goto(url, { timeout: options.timeoutMs, waitUntil: 'networkidle' });
        const bytes = await page.screenshot({
          fullPage: options.fullPage,
          type: 'png',
        });
        return ok(bytes);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return err({ code: 'navigation-failed', url, message });
      }
    },
  };
}

async function launchOrNull(): Promise<PlaywrightBrowser | null> {
  try {
    const mod = (await import('playwright' as string)) as unknown as PlaywrightChromiumModule;
    return await mod.chromium.launch({ headless: true });
  } catch {
    return null;
  }
}

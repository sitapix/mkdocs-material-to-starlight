/**
 * Production adapter for the `ImageDiffer` port using pixelmatch + pngjs.
 *
 * As with the Playwright automator, neither pixelmatch nor pngjs is a hard
 * dependency. They are loaded with `await import()` on first call; missing
 * modules surface as a typed `driver-missing` error so the CLI can print a
 * clear installation hint.
 *
 *   npm install pixelmatch pngjs
 *
 * pixelmatch requires both images to share dimensions; mismatched sizes are
 * reported as `dimension-mismatch` rather than auto-resized — visual-diff is
 * a precise tool, and silent resampling would mask real differences.
 */

import type {
  DiffOptions,
  DiffStats,
  ImageDiffer,
  ImageDifferError,
} from '../../domain/ports/image-differ.js';
import { err, ok, type Result } from '../../domain/result.js';

type PixelmatchFn = (
  img1: Uint8Array,
  img2: Uint8Array,
  output: Uint8Array | null,
  width: number,
  height: number,
  options?: { threshold?: number },
) => number;

interface PngjsModule {
  readonly PNG: {
    sync: {
      read(buffer: Uint8Array): { width: number; height: number; data: Uint8Array };
    };
  };
}

interface PixelmatchModule {
  readonly default: PixelmatchFn;
}

const INSTALL_HINT =
  'install pixelmatch + pngjs to use the visual-diff feature: `npm install pixelmatch pngjs`';
const DEFAULT_PIXEL_THRESHOLD = 0.1;

export function createPixelmatchDiffer(): ImageDiffer {
  return {
    async diff(
      baseline: Uint8Array,
      converted: Uint8Array,
      options?: DiffOptions,
    ): Promise<Result<DiffStats, ImageDifferError>> {
      let pixelmatch: PixelmatchFn;
      let png: PngjsModule['PNG'];
      try {
        const pmMod = (await import('pixelmatch' as string)) as unknown as PixelmatchModule;
        const pngMod = (await import('pngjs' as string)) as unknown as PngjsModule;
        pixelmatch = pmMod.default;
        png = pngMod.PNG;
      } catch {
        return err({ code: 'driver-missing', message: INSTALL_HINT });
      }

      let baselineImage: ReturnType<typeof png.sync.read>;
      let convertedImage: ReturnType<typeof png.sync.read>;
      try {
        baselineImage = png.sync.read(baseline);
        convertedImage = png.sync.read(converted);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'invalid PNG bytes';
        return err({ code: 'invalid-png', message });
      }

      if (
        baselineImage.width !== convertedImage.width ||
        baselineImage.height !== convertedImage.height
      ) {
        return err({
          code: 'dimension-mismatch',
          message: `baseline ${String(baselineImage.width)}x${String(baselineImage.height)} vs converted ${String(convertedImage.width)}x${String(convertedImage.height)}`,
        });
      }

      const mismatchedPixels = pixelmatch(
        baselineImage.data,
        convertedImage.data,
        null,
        baselineImage.width,
        baselineImage.height,
        { threshold: options?.pixelThreshold ?? DEFAULT_PIXEL_THRESHOLD },
      );

      return ok({
        mismatchedPixels,
        width: baselineImage.width,
        height: baselineImage.height,
      });
    },
  };
}

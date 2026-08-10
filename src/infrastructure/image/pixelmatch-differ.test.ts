import { createRequire } from 'node:module';
import pixelmatch from 'pixelmatch';
import { describe, expect, it } from 'vitest';
import { createPixelmatchDiffer } from './pixelmatch-differ.js';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as {
  PNG: {
    sync: {
      write(image: { width: number; height: number; data: Uint8Array }): Uint8Array;
    };
  };
};

function png(width: number, height: number, rgba: readonly number[]): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(rgba, offset);
  return PNG.sync.write({ width, height, data });
}

describe('createPixelmatchDiffer', () => {
  it('returns invalid-png for malformed image bytes', async () => {
    const result = await createPixelmatchDiffer().diff(new Uint8Array([1]), new Uint8Array([2]));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid-png');
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  it('reports width and height mismatches without resampling', async () => {
    const differ = createPixelmatchDiffer();
    const oneByOne = png(1, 1, [0, 0, 0, 255]);
    const twoByOne = png(2, 1, [0, 0, 0, 255]);
    const oneByTwo = png(1, 2, [0, 0, 0, 255]);

    const width = await differ.diff(oneByOne, twoByOne);
    expect(width).toMatchObject({
      ok: false,
      error: { code: 'dimension-mismatch', message: 'baseline 1x1 vs converted 2x1' },
    });

    const height = await differ.diff(oneByOne, oneByTwo);
    expect(height).toMatchObject({
      ok: false,
      error: { code: 'dimension-mismatch', message: 'baseline 1x1 vs converted 1x2' },
    });
  });

  it('counts mismatched pixels with the default and a custom threshold', async () => {
    expect(typeof pixelmatch).toBe('function');
    const differ = createPixelmatchDiffer();
    const black = png(1, 1, [0, 0, 0, 255]);
    const white = png(1, 1, [255, 255, 255, 255]);

    await expect(differ.diff(black, white)).resolves.toEqual({
      ok: true,
      value: { mismatchedPixels: 1, width: 1, height: 1 },
    });
    await expect(differ.diff(black, black, { pixelThreshold: 0.25 })).resolves.toEqual({
      ok: true,
      value: { mismatchedPixels: 0, width: 1, height: 1 },
    });
  });
});

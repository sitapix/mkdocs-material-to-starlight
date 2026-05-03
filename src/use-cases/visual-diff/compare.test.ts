import { describe, expect, it } from 'vitest';
import { compareSites } from './compare.js';
import { ok, err } from '../../domain/result.js';
import type { BrowserAutomator } from '../../domain/ports/browser-automator.js';
import type { ImageDiffer } from '../../domain/ports/image-differ.js';

const PNG_A = new Uint8Array([1, 2, 3]);
const PNG_B = new Uint8Array([4, 5, 6]);

function fakeBrowser(
  responses: Record<string, ReturnType<BrowserAutomator['capture']>>,
): BrowserAutomator {
  return {
    async capture(url) {
      const r = responses[url];
      if (r === undefined) {
        return err({
          code: 'navigation-failed',
          url,
          message: `no fake response for ${url}`,
        });
      }
      return r;
    },
  };
}

function fakeDiffer(stats: Awaited<ReturnType<ImageDiffer['diff']>>): ImageDiffer {
  return {
    async diff() {
      return stats;
    },
  };
}

describe('compareSites', () => {
  it('returns an empty report when given no pairs', async () => {
    const report = await compareSites({
      pairs: [],
      browser: fakeBrowser({}),
      differ: fakeDiffer(ok({ mismatchedPixels: 0, width: 0, height: 0 })),
      threshold: 0.01,
    });
    expect(report.results).toEqual([]);
    expect(report.summary.total).toBe(0);
  });

  it('marks a page as match when mismatch ratio is at or below threshold', async () => {
    const report = await compareSites({
      pairs: [
        { path: '/', baselineUrl: 'http://b/', convertedUrl: 'http://c/' },
      ],
      browser: fakeBrowser({
        'http://b/': Promise.resolve(ok(PNG_A)),
        'http://c/': Promise.resolve(ok(PNG_B)),
      }),
      differ: fakeDiffer(ok({ mismatchedPixels: 5, width: 100, height: 100 })),
      threshold: 0.01, // 1% — 5/10000 = 0.0005, well under
    });
    expect(report.results[0]?.status).toBe('match');
    expect(report.results[0]?.mismatchRatio).toBeCloseTo(0.0005, 4);
    expect(report.summary.matched).toBe(1);
    expect(report.summary.mismatched).toBe(0);
  });

  it('marks a page as mismatch when mismatch ratio exceeds threshold', async () => {
    const report = await compareSites({
      pairs: [
        { path: '/', baselineUrl: 'http://b/', convertedUrl: 'http://c/' },
      ],
      browser: fakeBrowser({
        'http://b/': Promise.resolve(ok(PNG_A)),
        'http://c/': Promise.resolve(ok(PNG_B)),
      }),
      differ: fakeDiffer(ok({ mismatchedPixels: 5000, width: 100, height: 100 })),
      threshold: 0.01,
    });
    expect(report.results[0]?.status).toBe('mismatch');
    expect(report.summary.mismatched).toBe(1);
  });

  it('marks a page capture-failed when the baseline cannot be captured', async () => {
    const report = await compareSites({
      pairs: [
        { path: '/', baselineUrl: 'http://b/', convertedUrl: 'http://c/' },
      ],
      browser: fakeBrowser({
        'http://b/': Promise.resolve(
          err({ code: 'navigation-failed', url: 'http://b/', message: 'down' }),
        ),
        'http://c/': Promise.resolve(ok(PNG_B)),
      }),
      differ: fakeDiffer(ok({ mismatchedPixels: 0, width: 100, height: 100 })),
      threshold: 0.01,
    });
    expect(report.results[0]?.status).toBe('capture-failed');
    expect(report.results[0]?.failureReason).toContain('http://b/');
    expect(report.summary.captureFailed).toBe(1);
  });

  it('marks a page diff-failed when the differ rejects (dimension mismatch)', async () => {
    const report = await compareSites({
      pairs: [
        { path: '/', baselineUrl: 'http://b/', convertedUrl: 'http://c/' },
      ],
      browser: fakeBrowser({
        'http://b/': Promise.resolve(ok(PNG_A)),
        'http://c/': Promise.resolve(ok(PNG_B)),
      }),
      differ: fakeDiffer(
        err({ code: 'dimension-mismatch', message: '800x600 vs 1024x768' }),
      ),
      threshold: 0.01,
    });
    expect(report.results[0]?.status).toBe('diff-failed');
    expect(report.summary.diffFailed).toBe(1);
  });

  it('preserves pair order in the results', async () => {
    const stats = ok({ mismatchedPixels: 0, width: 10, height: 10 });
    const report = await compareSites({
      pairs: [
        { path: '/a', baselineUrl: 'http://b/a', convertedUrl: 'http://c/a' },
        { path: '/b', baselineUrl: 'http://b/b', convertedUrl: 'http://c/b' },
        { path: '/c', baselineUrl: 'http://b/c', convertedUrl: 'http://c/c' },
      ],
      browser: fakeBrowser({
        'http://b/a': Promise.resolve(ok(PNG_A)),
        'http://b/b': Promise.resolve(ok(PNG_A)),
        'http://b/c': Promise.resolve(ok(PNG_A)),
        'http://c/a': Promise.resolve(ok(PNG_B)),
        'http://c/b': Promise.resolve(ok(PNG_B)),
        'http://c/c': Promise.resolve(ok(PNG_B)),
      }),
      differ: fakeDiffer(stats),
      threshold: 0.01,
    });
    expect(report.results.map((r) => r.path)).toEqual(['/a', '/b', '/c']);
  });

  it('threshold = 0 means any mismatched pixel fails', async () => {
    const report = await compareSites({
      pairs: [
        { path: '/', baselineUrl: 'http://b/', convertedUrl: 'http://c/' },
      ],
      browser: fakeBrowser({
        'http://b/': Promise.resolve(ok(PNG_A)),
        'http://c/': Promise.resolve(ok(PNG_B)),
      }),
      differ: fakeDiffer(ok({ mismatchedPixels: 1, width: 100, height: 100 })),
      threshold: 0,
    });
    expect(report.results[0]?.status).toBe('mismatch');
  });

  it('summary counts add up to the total', async () => {
    const report = await compareSites({
      pairs: [
        { path: '/match', baselineUrl: 'http://b/m', convertedUrl: 'http://c/m' },
        { path: '/miss', baselineUrl: 'http://b/x', convertedUrl: 'http://c/x' },
      ],
      browser: fakeBrowser({
        'http://b/m': Promise.resolve(ok(PNG_A)),
        'http://c/m': Promise.resolve(ok(PNG_A)),
        'http://b/x': Promise.resolve(ok(PNG_A)),
        'http://c/x': Promise.resolve(ok(PNG_B)),
      }),
      differ: {
        async diff(a, b) {
          // First call: equal; second: mismatch.
          if (a === b) return ok({ mismatchedPixels: 0, width: 10, height: 10 });
          return ok({ mismatchedPixels: 100, width: 10, height: 10 });
        },
      },
      threshold: 0.01,
    });
    const s = report.summary;
    expect(s.total).toBe(2);
    expect(s.matched + s.mismatched + s.captureFailed + s.diffFailed).toBe(s.total);
  });

  it('echoes the threshold back on the report so the serializer can show it', async () => {
    const report = await compareSites({
      pairs: [],
      browser: fakeBrowser({}),
      differ: fakeDiffer(ok({ mismatchedPixels: 0, width: 0, height: 0 })),
      threshold: 0.05,
    });
    expect(report.threshold).toBe(0.05);
  });
});

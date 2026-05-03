import { describe, expect, it } from 'vitest';
import { serializeVisualDiffReport } from './serialize-report.js';
import type { VisualDiffReport } from '../../domain/visual-diff/page-diff.js';

function reportOf(report: Partial<VisualDiffReport>): VisualDiffReport {
  return {
    threshold: 0.01,
    results: [],
    summary: { total: 0, matched: 0, mismatched: 0, captureFailed: 0, diffFailed: 0 },
    ...report,
  };
}

describe('serializeVisualDiffReport', () => {
  it('emits a header with the threshold', () => {
    const text = serializeVisualDiffReport(reportOf({ threshold: 0.05 }));
    expect(text).toContain('# Visual Diff Report');
    expect(text).toContain('threshold');
    expect(text).toContain('5%');
  });

  it('emits a "no pages compared" line when results are empty', () => {
    const text = serializeVisualDiffReport(reportOf({}));
    expect(text).toMatch(/no pages compared/i);
  });

  it('lists every page with its status', () => {
    const text = serializeVisualDiffReport(
      reportOf({
        results: [
          {
            path: '/api',
            status: 'match',
            mismatchedPixels: 0,
            totalPixels: 1000,
            mismatchRatio: 0,
          },
          {
            path: '/about',
            status: 'mismatch',
            mismatchedPixels: 500,
            totalPixels: 1000,
            mismatchRatio: 0.5,
          },
          {
            path: '/missing',
            status: 'capture-failed',
            failureReason: 'navigation-failed',
          },
        ],
        summary: {
          total: 3,
          matched: 1,
          mismatched: 1,
          captureFailed: 1,
          diffFailed: 0,
        },
      }),
    );
    expect(text).toContain('/api');
    expect(text).toContain('/about');
    expect(text).toContain('/missing');
    expect(text).toContain('match');
    expect(text).toContain('mismatch');
    expect(text).toContain('capture-failed');
  });

  it('groups failures (mismatch + capture-failed + diff-failed) under a "Needs review" heading', () => {
    const text = serializeVisualDiffReport(
      reportOf({
        results: [
          { path: '/a', status: 'match', mismatchedPixels: 0, totalPixels: 1, mismatchRatio: 0 },
          {
            path: '/b',
            status: 'mismatch',
            mismatchedPixels: 100,
            totalPixels: 1000,
            mismatchRatio: 0.1,
          },
        ],
        summary: { total: 2, matched: 1, mismatched: 1, captureFailed: 0, diffFailed: 0 },
      }),
    );
    expect(text).toMatch(/needs review/i);
    // The matching page should NOT appear in the failure section.
    const review = text.split(/needs review/i)[1] ?? '';
    expect(review).toContain('/b');
    expect(review).not.toContain('/a ');
  });

  it('renders mismatch ratio as a percentage with at most 2 decimal places', () => {
    const text = serializeVisualDiffReport(
      reportOf({
        results: [
          {
            path: '/x',
            status: 'mismatch',
            mismatchedPixels: 1234,
            totalPixels: 100000,
            mismatchRatio: 0.01234,
          },
        ],
        summary: { total: 1, matched: 0, mismatched: 1, captureFailed: 0, diffFailed: 0 },
      }),
    );
    expect(text).toMatch(/1\.23%/);
  });

  it('summary line shows N matched / M total', () => {
    const text = serializeVisualDiffReport(
      reportOf({
        summary: { total: 5, matched: 3, mismatched: 2, captureFailed: 0, diffFailed: 0 },
      }),
    );
    expect(text).toMatch(/3 \/ 5/);
  });

  it('idempotent: serializing twice yields identical text', () => {
    const r = reportOf({
      results: [
        { path: '/x', status: 'match', mismatchedPixels: 0, totalPixels: 10, mismatchRatio: 0 },
      ],
      summary: { total: 1, matched: 1, mismatched: 0, captureFailed: 0, diffFailed: 0 },
    });
    expect(serializeVisualDiffReport(r)).toBe(serializeVisualDiffReport(r));
  });
});

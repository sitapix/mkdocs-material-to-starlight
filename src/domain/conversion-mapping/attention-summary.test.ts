import { describe, expect, it } from 'vitest';
import { attentionSummary } from './attention-summary.js';
import type { MappingRow } from './table.js';

const baseRow: MappingRow = {
  featureId: 'test',
  materialInput: 'in',
  requiredExtensions: [],
  starlightOutput:
    'long detailed prose with multiple clauses, parentheticals (like this), and named-loss tail — diagnostic confirms…',
  fileExt: 'md',
  conversionType: 'recommended-dep',
  risk: 'low',
};

describe('attentionSummary', () => {
  it('returns the row.summary when provided', () => {
    expect(attentionSummary({ ...baseRow, summary: 'short' })).toBe('short');
  });

  it('falls back to starlightOutput when summary is absent', () => {
    expect(attentionSummary(baseRow)).toBe(baseRow.starlightOutput);
  });

  it('treats empty string summary as absent (falls back to starlightOutput)', () => {
    expect(attentionSummary({ ...baseRow, summary: '' })).toBe(baseRow.starlightOutput);
  });
});

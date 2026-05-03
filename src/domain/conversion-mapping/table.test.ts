import { describe, expect, it } from 'vitest';
import { getMappingRow, getAllMappingRows } from './table.js';

describe('conversion mapping table', () => {
  it('returns null for an unknown feature id', () => {
    expect(getMappingRow('not-a-real-feature')).toBeNull();
  });

  it('contains a row for the legacy admonition block', () => {
    const row = getMappingRow('admonition-block');
    expect(row).not.toBeNull();
    expect(row?.materialInput).toContain('!!!');
    expect(row?.starlightOutput).toContain(':::');
    expect(row?.requiredExtensions).toContain('admonition');
    expect(row?.fileExt).toBe('md');
    expect(row?.conversionType).toBe('text-pre-parse');
  });

  it('every row has a unique featureId', () => {
    const ids = getAllMappingRows().map((row) => row.featureId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every row has a non-empty featureId, materialInput, and starlightOutput', () => {
    for (const row of getAllMappingRows()) {
      expect(row.featureId.length).toBeGreaterThan(0);
      expect(row.materialInput.length).toBeGreaterThan(0);
      expect(row.starlightOutput.length).toBeGreaterThan(0);
    }
  });
});

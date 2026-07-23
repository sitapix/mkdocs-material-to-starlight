import { describe, expect, it } from 'vitest';
import { normalizeFrontmatterDateFlatten } from './frontmatter-date-flatten.js';

const doc = (fm: string): string => `---\n${fm}\n---\n\nBody text.\n`;

describe('normalizeFrontmatterDateFlatten', () => {
  it('flattens block-form date.created to a scalar date', () => {
    // Field-tested (squidfunk/mkdocs-material `mkdocs-2-0.md`): Material
    // blog's nested date mapping fails starlight-blog's schema with
    // "date: Expected type 'date', received 'object'".
    const out = normalizeFrontmatterDateFlatten(doc('title: X\ndate:\n  created: 2026-02-18'));
    expect(out).toContain('date: 2026-02-18');
    expect(out).not.toContain('created:');
  });

  it('maps date.updated to lastUpdated when both keys are present', () => {
    const out = normalizeFrontmatterDateFlatten(
      doc('title: X\ndate:\n  created: 2026-02-18\n  updated: 2026-03-01'),
    );
    expect(out).toContain('date: 2026-02-18');
    expect(out).toContain('lastUpdated: 2026-03-01');
    expect(out).not.toContain('updated: 2026-03-01\n  ');
  });

  it('uses updated as the date when created is absent', () => {
    const out = normalizeFrontmatterDateFlatten(doc('date:\n  updated: 2026-03-01'));
    expect(out).toContain('date: 2026-03-01');
    expect(out).not.toContain('lastUpdated:');
  });

  it('flattens flow-form date mappings', () => {
    const out = normalizeFrontmatterDateFlatten(
      doc('date: { created: 2026-02-18, updated: 2026-03-01 }'),
    );
    expect(out).toContain('date: 2026-02-18');
    expect(out).toContain('lastUpdated: 2026-03-01');
  });

  it('unquotes quoted ISO dates so YAML parses timestamps, not strings', () => {
    // Starlight's lastUpdated schema is `date | boolean` with no string
    // coercion — a quoted value would fail validation.
    const out = normalizeFrontmatterDateFlatten(
      doc("date:\n  created: '2026-02-18'\n  updated: '2026-03-01'"),
    );
    expect(out).toContain('date: 2026-02-18');
    expect(out).toContain('lastUpdated: 2026-03-01');
    expect(out).not.toContain("'2026-03-01'");
  });

  it('leaves scalar date values untouched', () => {
    const src = doc('title: X\ndate: 2023-11-30');
    expect(normalizeFrontmatterDateFlatten(src)).toBe(src);
  });

  it('leaves mappings with unknown keys untouched (diagnostics handle them)', () => {
    const src = doc('date:\n  created: 2026-02-18\n  timezone: UTC');
    expect(normalizeFrontmatterDateFlatten(src)).toBe(src);
  });

  it('is idempotent', () => {
    const once = normalizeFrontmatterDateFlatten(
      doc('date:\n  created: 2026-02-18\n  updated: 2026-03-01'),
    );
    expect(normalizeFrontmatterDateFlatten(once)).toBe(once);
  });

  it('does not touch documents without frontmatter', () => {
    const src = '# Just a heading\n\ndate:\n  created: 2026-02-18\n';
    expect(normalizeFrontmatterDateFlatten(src)).toBe(src);
  });
});

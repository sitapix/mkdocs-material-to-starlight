import { describe, expect, it } from 'vitest';
import { inferFrontmatterTypes } from './infer-frontmatter-types.js';

describe('inferFrontmatterTypes', () => {
  it('returns empty map when no fields supplied', () => {
    expect(inferFrontmatterTypes([], [])).toEqual({});
  });

  it('infers z.string() from quoted/bare string values', () => {
    const out = inferFrontmatterTypes(
      ['author'],
      [{ source: '---\ntitle: X\nauthor: Bob\n---\n' }],
    );
    expect(out.author).toBe('z.string().optional()');
  });

  it('infers z.boolean() from true/false', () => {
    const out = inferFrontmatterTypes(
      ['draft'],
      [
        { source: '---\ntitle: A\ndraft: true\n---\n' },
        { source: '---\ntitle: B\ndraft: false\n---\n' },
      ],
    );
    expect(out.draft).toBe('z.boolean().optional()');
  });

  it('infers z.number() from integers and floats', () => {
    const out = inferFrontmatterTypes(
      ['weight', 'rating'],
      [
        { source: '---\ntitle: X\nweight: 100\nrating: 4.5\n---\n' },
      ],
    );
    expect(out.weight).toBe('z.number().optional()');
    expect(out.rating).toBe('z.number().optional()');
  });

  it('infers z.coerce.date() from ISO date strings', () => {
    const out = inferFrontmatterTypes(
      ['lastUpdated'],
      [{ source: '---\ntitle: X\nlastUpdated: 2024-08-09\n---\n' }],
    );
    expect(out.lastUpdated).toBe('z.coerce.date().optional()');
  });

  it('infers z.array(z.string()) from inline array of strings', () => {
    const out = inferFrontmatterTypes(
      ['tags'],
      [{ source: '---\ntitle: X\ntags: [a, b, c]\n---\n' }],
    );
    expect(out.tags).toBe('z.array(z.string()).optional()');
  });

  it('infers z.array(z.string()) from block-style list of strings', () => {
    const out = inferFrontmatterTypes(
      ['authors'],
      [
        {
          source: ['---', 'title: X', 'authors:', '  - Alice', '  - Bob', '---', ''].join('\n'),
        },
      ],
    );
    expect(out.authors).toBe('z.array(z.string()).optional()');
  });

  it('falls back to z.unknown().optional() for object/unknown shapes', () => {
    const out = inferFrontmatterTypes(
      ['social'],
      [
        {
          source: ['---', 'title: X', 'social:', '  cards_layout: default', '---', ''].join('\n'),
        },
      ],
    );
    expect(out.social).toBe('z.unknown().optional()');
  });

  it('aggregates evidence from multiple files (string wins over date if mixed)', () => {
    const out = inferFrontmatterTypes(
      ['identifier'],
      [
        { source: '---\ntitle: A\nidentifier: 2024-01-01\n---\n' },
        { source: '---\ntitle: B\nidentifier: arbitrary-string\n---\n' },
      ],
    );
    // Mixed string + date → fall back to string (more permissive).
    expect(out.identifier).toBe('z.string().optional()');
  });

  it('returns z.unknown().optional() for fields never observed', () => {
    const out = inferFrontmatterTypes(
      ['phantom'],
      [{ source: '---\ntitle: X\nother: hello\n---\n' }],
    );
    expect(out.phantom).toBe('z.unknown().optional()');
  });
});

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
      [{ source: '---\ntitle: X\nweight: 100\nrating: 4.5\n---\n' }],
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

  it('emits a string|boolean union when the same field is bool on one page and string on another', () => {
    // Real-world (jujimeizuo/note): some pages use `comment: true` (Material
    // Giscus toggle) while others use `comment: "thread-id"`. A z.string()
    // fallback would reject the boolean pages at content-load time.
    const out = inferFrontmatterTypes(
      ['comment'],
      [
        { source: '---\ntitle: A\ncomment: true\n---\n' },
        { source: '---\ntitle: B\ncomment: "see thread"\n---\n' },
      ],
    );
    expect(out.comment).toBe('z.union([z.string(), z.boolean()]).optional()');
  });

  it('classifies YAML 1.2 capitalised booleans (`True`, `False`, `TRUE`) as boolean', () => {
    // Real-world (jujimeizuo/note): `comment: True`, `nostatistics: True`.
    // The YAML loader parses these as booleans; classifying them as string
    // produced a z.string() schema that then rejected the value at
    // content-load time.
    const out = inferFrontmatterTypes(
      ['flag', 'other'],
      [{ source: '---\ntitle: A\nflag: True\nother: FALSE\n---\n' }],
    );
    expect(out.flag).toBe('z.boolean().optional()');
    expect(out.other).toBe('z.boolean().optional()');
  });

  it('emits a string|number union when the same field is number on one page and string on another', () => {
    const out = inferFrontmatterTypes(
      ['weight'],
      [
        { source: '---\ntitle: A\nweight: 3\n---\n' },
        { source: '---\ntitle: B\nweight: "high"\n---\n' },
      ],
    );
    expect(out.weight).toBe('z.union([z.string(), z.number()]).optional()');
  });
});

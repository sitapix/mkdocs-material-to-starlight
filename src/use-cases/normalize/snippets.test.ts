import { describe, expect, it } from 'vitest';
import { detectSnippets } from './snippets.js';

describe('detectSnippets', () => {
  it('returns no detections for plain text', () => {
    const result = detectSnippets('# Heading\n\nA paragraph.\n');
    expect(result).toEqual([]);
  });

  it('detects an inline single-line snippet', () => {
    const src = 'Intro.\n\n--8<-- "partials/foo.md"\n\nNext paragraph.\n';
    const result = detectSnippets(src);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'inline',
      line: 2,
      reference: { kind: 'inline', path: 'partials/foo.md' },
    });
  });

  it('detects a multi-file block snippet', () => {
    const src = ['Intro.', '', '--8<--', 'a.md', 'b.md', '--8<--', '', 'After.'].join('\n');
    const result = detectSnippets(src);
    expect(result).toHaveLength(1);
    const first = result[0];
    expect(first?.kind).toBe('block');
    if (first?.kind === 'block') {
      expect(first.startLine).toBe(2);
      expect(first.endLine).toBe(5);
      expect(first.references.map((r) => r.path)).toEqual(['a.md', 'b.md']);
    }
  });

  it('preserves the skipped flag in block-form references', () => {
    const src = ['--8<--', ';skip-me.md', 'real.md', '--8<--', ''].join('\n');
    const result = detectSnippets(src);
    expect(result).toHaveLength(1);
    const first = result[0];
    if (first?.kind === 'block') {
      expect(first.references[0]).toMatchObject({ path: 'skip-me.md', skipped: true });
      expect(first.references[1]).toMatchObject({ path: 'real.md', skipped: false });
    }
  });

  it('does not detect snippets inside fenced code', () => {
    const src = ['```', '--8<-- "fake.md"', '```', ''].join('\n');
    expect(detectSnippets(src)).toEqual([]);
  });

  it('detects multiple inline snippets in one document', () => {
    const src = '--8<-- "a.md"\n\nbody\n\n--8<-- "b.md"\n';
    const result = detectSnippets(src);
    expect(result).toHaveLength(2);
    expect(result.map((d) => (d.kind === 'inline' ? d.reference.path : null))).toEqual([
      'a.md',
      'b.md',
    ]);
  });

  it('reports an unclosed block as a malformed detection', () => {
    const src = ['--8<--', 'orphan.md', ''].join('\n');
    const result = detectSnippets(src);
    expect(result).toHaveLength(1);
    expect(result[0]?.kind).toBe('malformed');
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeCodeAnnotations } from './code-annotations.js';

describe('normalizeCodeAnnotations', () => {
  it('passes through text containing no fenced code', () => {
    const src = '# Heading\n\nA paragraph.\n';
    expect(normalizeCodeAnnotations(src)).toBe(src);
  });

  it('passes through a non-annotated fenced code block unchanged', () => {
    const src = '```python\nprint("hi")\n```\n';
    expect(normalizeCodeAnnotations(src)).toBe(src);
  });

  it('strips .annotate from a { .lang .annotate } info string', () => {
    const src = [
      '``` { .python .annotate }',
      'print("hi")',
      '```',
      '',
    ].join('\n');
    const out = normalizeCodeAnnotations(src);
    expect(out).not.toContain('.annotate');
    expect(out).toContain('python');
  });

  it('drops the bang from (N)! markers inside annotated code', () => {
    const src = [
      '``` { .python .annotate }',
      'print("hi")  # (1)!',
      'print("bye")  # (2)!',
      '```',
      '',
    ].join('\n');
    const out = normalizeCodeAnnotations(src);
    expect(out).toContain('# (1)');
    expect(out).toContain('# (2)');
    expect(out).not.toContain('(1)!');
    expect(out).not.toContain('(2)!');
  });

  it('does NOT strip (N)! markers from non-annotated fences', () => {
    const src = '```python\nprint("hi")  # (1)!\n```\n';
    expect(normalizeCodeAnnotations(src)).toBe(src);
  });

  it('preserves the trailing ordered list (the legend) verbatim', () => {
    const src = [
      '``` { .python .annotate }',
      'print("hi")  # (1)!',
      '```',
      '',
      '1.  This is the first annotation.',
      '2.  This is the second annotation.',
      '',
    ].join('\n');
    const out = normalizeCodeAnnotations(src);
    expect(out).toContain('1.  This is the first annotation.');
    expect(out).toContain('2.  This is the second annotation.');
  });

  it('handles multiple annotated fences in one document independently', () => {
    const src = [
      '``` { .py .annotate }',
      'a  # (1)!',
      '```',
      '',
      'Some prose.',
      '',
      '``` { .js .annotate }',
      'b  // (1)!',
      '```',
      '',
    ].join('\n');
    const out = normalizeCodeAnnotations(src);
    expect(out).not.toContain('.annotate');
    expect(out).not.toContain('(1)!');
    expect(out).toContain('a  # (1)');
    expect(out).toContain('b  // (1)');
  });

  it('is idempotent — running twice equals running once', () => {
    const src = [
      '``` { .python .annotate }',
      'print("hi")  # (1)!',
      '```',
      '',
    ].join('\n');
    const once = normalizeCodeAnnotations(src);
    expect(normalizeCodeAnnotations(once)).toBe(once);
  });
});

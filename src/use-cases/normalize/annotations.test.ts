import { describe, expect, it } from 'vitest';
import { normalizeAnnotations } from './annotations.js';

describe('normalizeAnnotations', () => {
  it('passes through text containing no annotation markers', () => {
    const src = '# Heading\n\nA plain paragraph.\n\n1. ordinary list.\n';
    expect(normalizeAnnotations(src)).toBe(src);
  });

  it('rewrites a simple annotation block as footnote refs and definitions', () => {
    const src = [
      'Lorem ipsum (1) dolor sit amet.',
      '{ .annotate }',
      '',
      '1.  I am an annotation.',
      '',
    ].join('\n');
    const out = normalizeAnnotations(src);
    expect(out).toContain('Lorem ipsum [^anno-1-1] dolor sit amet.');
    expect(out).toContain('[^anno-1-1]: I am an annotation.');
    expect(out).not.toContain('{ .annotate }');
    expect(out).not.toContain('1.  I am an annotation.');
  });

  it('handles multiple markers in one paragraph paired to multiple list items', () => {
    const src = [
      'First (1) marker and second (2) marker.',
      '{ .annotate }',
      '',
      '1.  First annotation body.',
      '2.  Second annotation body.',
      '',
    ].join('\n');
    const out = normalizeAnnotations(src);
    expect(out).toContain('First [^anno-1-1] marker and second [^anno-1-2] marker.');
    expect(out).toContain('[^anno-1-1]: First annotation body.');
    expect(out).toContain('[^anno-1-2]: Second annotation body.');
  });

  it('namespaces footnote IDs across multiple annotation blocks', () => {
    const src = [
      'First (1) block.',
      '{ .annotate }',
      '',
      '1.  Annotation A.',
      '',
      'Second (1) block.',
      '{ .annotate }',
      '',
      '1.  Annotation B.',
      '',
    ].join('\n');
    const out = normalizeAnnotations(src);
    expect(out).toContain('[^anno-1-1]');
    expect(out).toContain('[^anno-2-1]');
    expect(out).toContain('[^anno-1-1]: Annotation A.');
    expect(out).toContain('[^anno-2-1]: Annotation B.');
  });

  it('does not rewrite annotations inside fenced code', () => {
    const src = [
      '```',
      'Looks like (1)',
      '{ .annotate }',
      '',
      '1.  But it is not, this is code.',
      '```',
      '',
    ].join('\n');
    expect(normalizeAnnotations(src)).toBe(src);
  });

  it('is idempotent — running twice equals running once', () => {
    const src = ['Marker (1) here.', '{ .annotate }', '', '1.  Body.', ''].join('\n');
    const once = normalizeAnnotations(src);
    expect(normalizeAnnotations(once)).toBe(once);
  });

  it('leaves a paragraph alone if the trailing list is missing', () => {
    const src = ['Marker (1) here.', '{ .annotate }', '', 'Just prose, no list.', ''].join('\n');
    expect(normalizeAnnotations(src)).toBe(src);
  });

  it('leaves a paragraph alone if there is no marker matching the list', () => {
    const src = [
      'Plain paragraph with no markers.',
      '{ .annotate }',
      '',
      '1.  Stranded list item.',
      '',
    ].join('\n');
    expect(normalizeAnnotations(src)).toBe(src);
  });
});

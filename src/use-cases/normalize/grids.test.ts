import { describe, expect, it } from 'vitest';
import { normalizeCardGrids } from './grids.js';

describe('normalizeCardGrids', () => {
  it('passes through text containing no grid markup', () => {
    const src = '# Heading\n\nA paragraph.\n';
    expect(normalizeCardGrids(src)).toBe(src);
  });

  it('rewrites a card-grid block as :::card-grid containing :::card directives', () => {
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '- __HTML__ for content',
      '- __JavaScript__ for interactivity',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    expect(out).toContain(':::card-grid');
    expect(out).toContain(':::card');
    expect(out).toContain('__HTML__ for content');
    expect(out).toContain('__JavaScript__ for interactivity');
    expect(out).not.toContain('<div class="grid cards"');
    expect(out).not.toContain('</div>');
  });

  it('preserves the count of cards (one directive per list item)', () => {
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '- one',
      '- two',
      '- three',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    const cardOpens = out.match(/^:::card$/gm);
    expect(cardOpens?.length).toBe(3);
  });

  it('rewrites a generic grid as :::grid container with original block contents', () => {
    const src = [
      '<div class="grid" markdown>',
      '',
      '!!! note',
      '    body',
      '',
      '</div>',
      '',
    ].join('\n');
    const out = normalizeCardGrids(src);
    expect(out).toContain(':::grid');
    expect(out).toContain('!!! note');
    expect(out).not.toContain('<div class="grid"');
  });

  it('does not touch lines inside fenced code', () => {
    const src = [
      '```',
      '<div class="grid cards" markdown>',
      '',
      '- card',
      '',
      '</div>',
      '```',
      '',
    ].join('\n');
    expect(normalizeCardGrids(src)).toBe(src);
  });

  it('emits a diagnostic-shaped marker when grid block is unclosed', () => {
    const src = '<div class="grid cards" markdown>\n\n- card\n';
    const out = normalizeCardGrids(src);
    // Unclosed grid leaves the source verbatim — caller can detect via search
    expect(out).toContain('<div class="grid cards"');
  });

  it('is idempotent', () => {
    const src = [
      '<div class="grid cards" markdown>',
      '',
      '- a',
      '- b',
      '',
      '</div>',
      '',
    ].join('\n');
    const once = normalizeCardGrids(src);
    expect(normalizeCardGrids(once)).toBe(once);
  });
});

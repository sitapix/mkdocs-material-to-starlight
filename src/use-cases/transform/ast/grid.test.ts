import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { transformGridDirectives } from './grid.js';

function process(source: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(transformGridDirectives)
    .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
    .processSync(source);
  return String(file);
}

describe('transformGridDirectives', () => {
  it('passes through plain markdown unchanged', () => {
    const out = process('# Heading\n\nA paragraph.\n');
    expect(out).toContain('# Heading');
  });

  it('rewrites :::card-grid into a CardGrid HTML structure', () => {
    const out = process(':::card-grid\n:::card\nbody\n:::\n:::\n');
    expect(out).toContain('<div class="sl-card-grid">');
    expect(out).not.toContain(':::card-grid');
  });

  it('rewrites :::card directives inside the grid into div.sl-card blocks', () => {
    const out = process(':::card-grid\n:::card\ncard one\n:::\n:::card\ncard two\n:::\n:::\n');
    expect(out).toContain('<div class="sl-card">');
    expect(out).toContain('card one');
    expect(out).toContain('card two');
    const cardCount = out.match(/<div class="sl-card">/g)?.length ?? 0;
    expect(cardCount).toBe(2);
  });

  it('preserves card title labels as <strong> when present', () => {
    const out = process(':::card-grid\n:::card[My Card]\nbody\n:::\n:::\n');
    expect(out).toContain('<strong>My Card</strong>');
  });

  it('rewrites :::grid (generic) into a div.sl-grid', () => {
    const out = process(':::grid\nfree-form body\n:::\n');
    expect(out).toContain('<div class="sl-grid">');
    expect(out).toContain('free-form body');
    expect(out).not.toContain(':::grid');
  });

  it('leaves directives unrelated to grids alone', () => {
    const out = process(':::tabs\nbody\n:::\n');
    expect(out).toContain(':::tabs');
    expect(out).not.toContain('sl-grid');
  });

  it('is idempotent — converted output passes through untouched', () => {
    const first = process(':::card-grid\n:::card\nbody\n:::\n:::\n');
    const second = process(first);
    expect(second).toBe(first);
  });
});

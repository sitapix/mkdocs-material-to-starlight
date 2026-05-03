import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkDirective from 'remark-directive';
import { transformTabDirectives } from './tabs.js';

function process(source: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(transformTabDirectives)
    .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
    .processSync(source);
  return String(file);
}

describe('transformTabDirectives', () => {
  it('passes through plain markdown unchanged', () => {
    const out = process('# Heading\n\nA paragraph.\n');
    expect(out).toContain('# Heading');
  });

  it('rewrites ::::tabs into a sl-tabs HTML block', () => {
    const out = process('::::tabs\n:::tab[A]\nbody\n:::\n::::\n');
    expect(out).toContain('<div class="sl-tabs">');
    expect(out).not.toContain('::::tabs');
    expect(out).not.toContain(':::tab');
  });

  it('rewrites :::tab directives into div.sl-tab blocks with title', () => {
    const out = process('::::tabs\n:::tab[macOS]\nbrew install\n:::\n:::tab[Linux]\napt install\n:::\n::::\n');
    expect(out).toContain('<div class="sl-tab" data-label="macOS">');
    expect(out).toContain('<div class="sl-tab" data-label="Linux">');
    expect(out).toContain('brew install');
    expect(out).toContain('apt install');
    const tabCount = out.match(/<div class="sl-tab" data-label=/g)?.length ?? 0;
    expect(tabCount).toBe(2);
  });

  it('handles the exclusive variant by tagging the container', () => {
    const out = process('::::tabs{exclusive}\n:::tab[A]\nbody\n:::\n::::\n');
    expect(out).toMatch(/<div class="sl-tabs"[^>]*data-exclusive="true"[^>]*>/);
  });

  it('leaves unrelated directives alone', () => {
    const out = process(':::note\nbody\n:::\n');
    expect(out).toContain(':::note');
    expect(out).not.toContain('sl-tabs');
  });

  it('keeps the second tab inside the tabs container (regression: colon-nesting)', () => {
    const out = process('::::tabs\n:::tab[A]\none\n:::\n:::tab[B]\ntwo\n:::\n::::\n');
    const tabsOpen = out.indexOf('<div class="sl-tabs">');
    const secondTabA = out.indexOf('data-label="A"');
    const secondTabB = out.indexOf('data-label="B"');
    expect(secondTabA).toBeGreaterThan(tabsOpen);
    expect(secondTabB).toBeGreaterThan(secondTabA);
    const finalDivClose = out.lastIndexOf('</div>');
    expect(finalDivClose).toBeGreaterThan(secondTabB);
  });

  it('is idempotent — converted output passes through untouched', () => {
    const first = process('::::tabs\n:::tab[A]\nbody\n:::\n::::\n');
    const second = process(first);
    expect(second).toBe(first);
  });

  it('preserves backtick-quoted tab labels (pydantic regression)', () => {
    // Tab labels like `pydantic<3` are inlineCode nodes in the AST, not text
    // nodes. The label extractor must include inlineCode values so the label
    // is not silently dropped.
    const out = process('::::tabs\n:::tab[`pydantic<3`]\nbody\n:::\n::::\n');
    expect(out).toContain('data-label="pydantic<3"');
    expect(out).not.toContain('data-label=""');
  });

  it('preserves backtick tab labels in MDX mode (<TabItem>)', () => {
    const source = '::::tabs\n:::tab[`pydantic>=1.10.17,<3`]\nbody\n:::\n::::\n';
    const file = unified()
      .use(remarkParse)
      .use(remarkDirective)
      .use(transformTabDirectives, { emitMdxTabs: true })
      .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
      .processSync(source);
    const out = String(file);
    expect(out).toContain('label="pydantic>=1.10.17,<3"');
    expect(out).not.toContain('label="Tab"');
  });
});

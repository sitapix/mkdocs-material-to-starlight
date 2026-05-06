import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkDirective from 'remark-directive';
import { mdxJsxToMarkdown } from 'mdast-util-mdx-jsx';
import { transformTabDirectives, type TabTransformOptions } from './tabs.js';

function remarkMdxJsxStringify(this: { data: () => { toMarkdownExtensions?: unknown[] } }): undefined {
  const data = this.data();
  const list = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = []);
  const full = mdxJsxToMarkdown() as { handlers: unknown };
  (list as unknown[]).push({ handlers: full.handlers });
  return undefined;
}

function process(source: string, options: TabTransformOptions = {}): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkMdxJsxStringify)
    .use(transformTabDirectives, options)
    .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
    .processSync(source);
  return String(file);
}

describe('transformTabDirectives', () => {
  it('passes through plain markdown unchanged', () => {
    const out = process('# Heading\n\nA paragraph.\n');
    expect(out).toContain('# Heading');
  });

  describe('default (MDX) mode', () => {
    it('rewrites ::::tabs into a <Tabs> JSX wrapper', () => {
      const out = process('::::tabs\n:::tab[A]\nbody\n:::\n::::\n');
      expect(out).toContain('<Tabs>');
      expect(out).toContain('</Tabs>');
      expect(out).not.toContain('::::tabs');
      expect(out).not.toContain(':::tab');
      expect(out).not.toContain('class="sl-tabs"');
    });

    it('rewrites :::tab directives into <TabItem label="…"> blocks', () => {
      const out = process('::::tabs\n:::tab[macOS]\nbrew install\n:::\n:::tab[Linux]\napt install\n:::\n::::\n');
      expect(out).toContain('<TabItem label="macOS">');
      expect(out).toContain('<TabItem label="Linux">');
      expect(out).toContain('brew install');
      expect(out).toContain('apt install');
      const tabCount = out.match(/<TabItem label=/g)?.length ?? 0;
      expect(tabCount).toBe(2);
    });

    it('does NOT emit syncKey when tabsLinked is not set', () => {
      const out = process('::::tabs\n:::tab[A]\nbody\n:::\n:::tab[B]\nx\n:::\n::::\n');
      expect(out).toContain('<Tabs>');
      expect(out).not.toMatch(/syncKey=/);
    });

    it('emits syncKey on <Tabs> when tabsLinked is set', () => {
      const out = process(
        '::::tabs\n:::tab[Bash]\nx\n:::\n:::tab[Python]\ny\n:::\n::::\n',
        { tabsLinked: true },
      );
      expect(out).toMatch(/syncKey="bash-python"/);
    });

    it('keeps the second tab inside the <Tabs> container (regression: colon-nesting)', () => {
      const out = process('::::tabs\n:::tab[A]\none\n:::\n:::tab[B]\ntwo\n:::\n::::\n');
      const tabsOpen = out.indexOf('<Tabs>');
      const tabA = out.indexOf('label="A"');
      const tabB = out.indexOf('label="B"');
      const tabsClose = out.lastIndexOf('</Tabs>');
      expect(tabA).toBeGreaterThan(tabsOpen);
      expect(tabB).toBeGreaterThan(tabA);
      expect(tabsClose).toBeGreaterThan(tabB);
    });

    it('is idempotent — converted output passes through untouched', () => {
      const first = process('::::tabs\n:::tab[A]\nbody\n:::\n::::\n');
      const second = process(first);
      expect(second).toBe(first);
    });

    it('preserves backtick-quoted tab labels (pydantic regression)', () => {
      const out = process('::::tabs\n:::tab[`pydantic<3`]\nbody\n:::\n::::\n');
      expect(out).toContain('label="pydantic<3"');
      expect(out).not.toContain('label=""');
    });

    it('preserves backtick tab labels with operators (pydantic >= range)', () => {
      const out = process('::::tabs\n:::tab[`pydantic>=1.10.17,<3`]\nbody\n:::\n::::\n');
      expect(out).toContain('label="pydantic>=1.10.17,<3"');
      expect(out).not.toContain('label="Tab"');
    });

    it('extracts a Material/FontAwesome icon shortcode into the TabItem icon prop', () => {
      const out = process('::::tabs\n:::tab[:fontawesome-brands-python: Python]\ncode\n:::\n::::\n');
      expect(out).toContain('icon="seti:python"');
      expect(out).toContain('label="Python"');
      expect(out).not.toContain(':fontawesome-brands-python:');
    });

    it('strips an unmapped icon shortcode from the TabItem label without an icon prop', () => {
      const out = process('::::tabs\n:::tab[:fontawesome-brands-rust: Rust]\ncode\n:::\n::::\n');
      expect(out).toContain('label="Rust"');
      expect(out).not.toContain(':fontawesome-brands-rust:');
      expect(out).not.toMatch(/icon="local:/);
    });

    it('leaves a tab label alone when it contains no icon shortcode', () => {
      const out = process('::::tabs\n:::tab[Plain Title]\nbody\n:::\n::::\n');
      expect(out).toContain('label="Plain Title"');
    });

    it('leaves unrelated directives alone', () => {
      const out = process(':::note\nbody\n:::\n');
      expect(out).toContain(':::note');
      expect(out).not.toContain('<Tabs>');
    });
  });

  describe('legacy HTML mode (emitMdxTabs: false)', () => {
    const legacy = (src: string) => process(src, { emitMdxTabs: false });

    it('rewrites ::::tabs into a sl-tabs HTML block', () => {
      const out = legacy('::::tabs\n:::tab[A]\nbody\n:::\n::::\n');
      expect(out).toContain('<div class="sl-tabs">');
      expect(out).not.toContain('<Tabs>');
    });

    it('rewrites :::tab directives into div.sl-tab blocks with data-label', () => {
      const out = legacy('::::tabs\n:::tab[macOS]\nbrew install\n:::\n:::tab[Linux]\napt install\n:::\n::::\n');
      expect(out).toContain('<div class="sl-tab" data-label="macOS">');
      expect(out).toContain('<div class="sl-tab" data-label="Linux">');
    });

    it('handles the exclusive variant by tagging the container', () => {
      const out = legacy('::::tabs{exclusive}\n:::tab[A]\nbody\n:::\n::::\n');
      expect(out).toMatch(/<div class="sl-tabs"[^>]*data-exclusive="true"[^>]*>/);
    });

    it('strips icon shortcodes from data-label too', () => {
      const out = legacy('::::tabs\n:::tab[:fontawesome-brands-python: Python]\ncode\n:::\n::::\n');
      expect(out).toContain('data-label="Python"');
      expect(out).not.toContain(':fontawesome-brands-python:');
    });
  });
});

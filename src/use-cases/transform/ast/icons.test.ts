import { mdxJsxToMarkdown } from 'mdast-util-mdx-jsx';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../../domain/diagnostics/diagnostic.js';
import { transformIcons } from './icons.js';

interface ProcessOutput {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

function remarkMdxJsxStringify(this: {
  data: () => { toMarkdownExtensions?: unknown[] };
}): undefined {
  const data = this.data();
  if (data.toMarkdownExtensions === undefined) {
    data.toMarkdownExtensions = [];
  }
  const list = data.toMarkdownExtensions;
  const full = mdxJsxToMarkdown() as { handlers: unknown };
  (list as unknown[]).push({ handlers: full.handlers });
  return undefined;
}

function process(source: string): ProcessOutput {
  const diagnostics: Diagnostic[] = [];
  const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkMdxJsxStringify)
    .use(transformIcons, { diagnostics })
    .use(remarkStringify, { bullet: '-', emphasis: '_', fences: true })
    .processSync(source);
  return { text: String(file), diagnostics };
}

describe('transformIcons', () => {
  it('passes through plain text containing no shortcodes', () => {
    const out = process('Click the button.\n');
    expect(out.text).toContain('Click the button.');
    expect(out.diagnostics).toEqual([]);
  });

  it('rewrites a curated Material shortcode into a `<Icon>` JSX tag', () => {
    // Output is JSX, not the legacy `:icon[name]` directive form — Starlight
    // has no remark plugin to render the directive, so the directive form
    // would silently become `<div>name</div>` in the rendered HTML.
    const out = process('Click :material-rocket: to launch.\n');
    expect(out.text).toContain('<Icon name="rocket" class="sl-inline-icon" />');
    expect(out.text).toContain('Click');
    expect(out.text).toContain('to launch.');
    expect(out.diagnostics).toEqual([]);
  });

  it('rewrites a known fontawesome brand shortcode', () => {
    const out = process('See :fontawesome-brands-github: for source.\n');
    expect(out.text).toContain('<Icon name="github" class="sl-inline-icon" />');
  });

  it('emits a `<Icon name="local:set:name" />` for unmapped Material icons', () => {
    const out = process('Use :material-totally-made-up: here.\n');
    expect(out.text).toContain(
      '<Icon name="local:material:totally-made-up" class="sl-inline-icon" />',
    );
  });

  it('emits a placeholder and a diagnostic for unrecognized icon-set prefixes', () => {
    const out = process('See :totally-unknown-prefix: here.\n');
    expect(out.diagnostics.some((d) => d.ruleId === 'icon-unmapped')).toBe(true);
    expect(out.text).toContain(':totally-unknown-prefix:');
  });

  it('icon-unmapped diagnostic message links to the third-party icon-set guide', () => {
    const out = process('See :totally-unknown-prefix: here.\n');
    const unmapped = out.diagnostics.find((d) => d.ruleId === 'icon-unmapped');
    expect(unmapped).toBeDefined();
    expect(unmapped?.message).toContain('https://hideoo.dev/notes/starlight-third-party-icon-sets');
  });

  it('handles multiple shortcodes in one text node', () => {
    const out = process(':material-rocket: and :fontawesome-brands-github: side by side.\n');
    expect(out.text).toContain('<Icon name="rocket" class="sl-inline-icon" />');
    expect(out.text).toContain('<Icon name="github" class="sl-inline-icon" />');
  });

  it('does not match shortcodes inside fenced code', () => {
    const out = process('```\n:material-rocket:\n```\n');
    expect(out.text).toContain(':material-rocket:');
    expect(out.text).not.toContain('<Icon name="rocket"');
  });

  it('does not match shortcodes inside inline code', () => {
    const out = process('Use `:material-rocket:` literally.\n');
    expect(out.text).toContain('`:material-rocket:`');
    expect(out.text).not.toContain('<Icon name="rocket"');
  });

  it('is idempotent — converting the converted output is a no-op', () => {
    const first = process('Hi :material-rocket: there.\n');
    const second = process(first.text);
    expect(second.text).toBe(first.text);
  });

  it('promotes attr_list { title="X" } following an icon to an `aria-label` attribute', () => {
    const out = process(':material-information:{ title="Important info" }\n');
    // The title becomes an `aria-label` attribute on the `<Icon>` tag so
    // screen readers announce it; Starlight passes the prop through to the
    // rendered SVG.
    expect(out.text).toContain('<Icon name="information"');
    expect(out.text).toContain('aria-label="Important info"');
    // The raw `{title="..."}` blob must NOT survive into the output.
    expect(out.text).not.toContain('{ title="Important info" }');
    expect(out.text).not.toContain('{title="Important info"}');
  });

  it('strips a non-title pure attr_list blob (`{ .class }`) when emitting the icon', () => {
    const out = process(':material-rocket:{ .youtube }\n');
    // The icon resolves and the class-only attr_list (no Starlight `<Icon>`
    // equivalent for arbitrary classes) gets stripped — leaving the literal
    // `{ .youtube }` would render as visible text.
    expect(out.text).toContain('<Icon name="rocket" class="sl-inline-icon" />');
    expect(out.text).not.toContain('{ .youtube }');
  });

  it('does not flag bare :identifier: tokens from other markdown extensions as unmapped icons', () => {
    // Real-world regression from encode/httpx api.md:
    //
    //   ::: httpx.request
    //       :docstring:
    //
    // mkautodoc directives use bare `:identifier:` tokens. Material icons are
    // always namespaced (`:material-foo:`, `:fontawesome-brands-bar:`), so a
    // bare `:identifier:` is by construction not an icon attempt. The icon
    // transformer must not claim it, must not emit `icon-unmapped`, and must
    // pass the surrounding text through unchanged.
    const out = process('Some prose with :docstring: and :members: and :smile:.\n');
    const iconWarnings = out.diagnostics.filter((d) => d.ruleId === 'icon-unmapped');
    expect(iconWarnings).toEqual([]);
  });
});

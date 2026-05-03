import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkDirective from 'remark-directive';
import { transformIcons } from './icons.js';
import type { Diagnostic } from '../../../domain/diagnostics/diagnostic.js';

interface ProcessOutput {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

function process(source: string): ProcessOutput {
  const diagnostics: Diagnostic[] = [];
  const file = unified()
    .use(remarkParse)
    .use(remarkDirective)
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

  it('rewrites a curated Material shortcode into a Starlight icon directive', () => {
    const out = process('Click :material-rocket: to launch.\n');
    expect(out.text).toContain(':icon[rocket]');
    expect(out.text).toContain('Click');
    expect(out.text).toContain('to launch.');
    expect(out.diagnostics).toEqual([]);
  });

  it('rewrites a known fontawesome brand shortcode', () => {
    const out = process('See :fontawesome-brands-github: for source.\n');
    expect(out.text).toContain(':icon[github]');
  });

  it('emits a local-svg directive with iconset metadata for unmapped Material icons', () => {
    const out = process('Use :material-totally-made-up: here.\n');
    // Serializer may escape colons inside the directive label; accept both forms.
    const stripped = out.text.replace(/\\/g, '');
    expect(stripped).toContain(':icon[local:material:totally-made-up]');
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
    expect(unmapped?.message).toContain(
      'https://hideoo.dev/notes/starlight-third-party-icon-sets',
    );
  });

  it('handles multiple shortcodes in one text node', () => {
    const out = process(':material-rocket: and :fontawesome-brands-github: side by side.\n');
    expect(out.text).toContain(':icon[rocket]');
    expect(out.text).toContain(':icon[github]');
  });

  it('does not match shortcodes inside fenced code', () => {
    const out = process('```\n:material-rocket:\n```\n');
    expect(out.text).toContain(':material-rocket:');
    expect(out.text).not.toContain(':icon[rocket]');
  });

  it('does not match shortcodes inside inline code', () => {
    const out = process('Use `:material-rocket:` literally.\n');
    expect(out.text).toContain('`:material-rocket:`');
    expect(out.text).not.toContain(':icon[rocket]');
  });

  it('is idempotent — converting the converted output is a no-op', () => {
    const first = process('Hi :material-rocket: there.\n');
    const second = process(first.text);
    expect(second.text).toBe(first.text);
  });

  it('promotes attr_list { title="X" } following an icon to the directive label attribute', () => {
    const out = process(':material-information:{ title="Important info" }\n');
    // Icon directive carries the title as `label` so Starlight renders
    // `<Icon name="information" label="Important info" />`.
    expect(out.text).toContain(':icon[information]');
    expect(out.text).toContain('label="Important info"');
    // The raw `{title="..."}` blob must NOT survive into the output.
    expect(out.text).not.toContain('{ title="Important info" }');
    expect(out.text).not.toContain('{title="Important info"}');
  });

  it('leaves a non-title attr_list blob untouched (only title is recognized)', () => {
    const out = process(':material-rocket:{ .youtube }\n');
    // Class-only attr blobs are out of scope for Phase-1; the icon is still
    // resolved, and the blob falls through as text. (Future: extend.)
    expect(out.text).toContain(':icon[rocket]');
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
    const out = process(
      'Some prose with :docstring: and :members: and :smile:.\n',
    );
    const iconWarnings = out.diagnostics.filter((d) => d.ruleId === 'icon-unmapped');
    expect(iconWarnings).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { convertFile } from './convert.js';
import { buildSlugMap, type SlugMap } from '../../domain/starlight/slug-map.js';

function fixture(paths: ReadonlyArray<string>): SlugMap {
  const result = buildSlugMap(paths);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe('convertFile', () => {
  it('passes through plain markdown unchanged', () => {
    const map = fixture(['index.md']);
    const out = convertFile({
      source: '# Heading\n\nA paragraph.\n',
      sourcePath: 'index.md',
      slugMap: map,
    });
    expect(out.text).toContain('# Heading');
    expect(out.text).toContain('A paragraph.');
    expect(out.diagnostics).toEqual([]);
  });

  it('normalizes a Material admonition into a Starlight aside directive', () => {
    const map = fixture(['index.md']);
    const out = convertFile({
      source: '!!! warning "Heads up"\n    Be careful.\n',
      sourcePath: 'index.md',
      slugMap: map,
    });
    expect(out.text).toContain(':::caution');
    expect(out.text).toContain('Heads up');
    expect(out.text).toContain('Be careful.');
    expect(out.text).not.toContain('!!!');
    expect(out.text).not.toContain(':::warning');
  });

  it('normalizes content tabs and rewrites internal links in one pass', () => {
    const map = fixture(['index.md', 'api/auth.md']);
    const source = [
      '# Index',
      '',
      'See [auth](api/auth.md) for details.',
      '',
      '=== "macOS"',
      '    brew install foo',
      '',
      '=== "Linux"',
      '    apt install foo',
      '',
    ].join('\n');
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain('<Tabs>');
    expect(out.text).toContain('<TabItem label="macOS">');
    expect(out.text).toContain('<TabItem label="Linux">');
    expect(out.text).toContain('[auth](/api/auth)');
    expect(out.extension).toBe('mdx');
  });

  it('reports a broken-link diagnostic without aborting the conversion', () => {
    const map = fixture(['index.md']);
    const out = convertFile({
      source: 'See [missing](missing.md).\n',
      sourcePath: 'index.md',
      slugMap: map,
    });
    // The broken link wrapper is stripped to plain text so the build
    // doesn't fail at runtime; the diagnostic captures the lost target.
    expect(out.text).toContain('See missing');
    expect(out.text).not.toContain('[missing](missing.md)');
    expect(out.diagnostics.some((d) => d.ruleId === 'broken-link')).toBe(true);
  });

  it('is idempotent — converting the converted output produces the same text', () => {
    const map = fixture(['index.md', 'api/auth.md']);
    const source = [
      '!!! warning',
      '    Be careful.',
      '',
      '=== "A"',
      '    body',
      '',
      'See [auth](api/auth.md).',
      '',
    ].join('\n');
    const first = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    const second = convertFile({
      source: first.text,
      sourcePath: 'index.md',
      slugMap: map,
    });
    expect(second.text).toBe(first.text);
  });

  it('preserves frontmatter when present', () => {
    const map = fixture(['index.md']);
    const source = [
      '---',
      'title: Welcome',
      'description: Demo page.',
      '---',
      '',
      '!!! note',
      '    Hello.',
      '',
    ].join('\n');
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain('title: Welcome');
    expect(out.text).toContain('description: Demo page.');
    expect(out.text).toContain(':::note');
  });

  it('does not double-convert directives already in Starlight form', () => {
    const map = fixture(['index.md']);
    const source = ':::tip\nAlready Starlight.\n:::\n';
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain(':::tip');
    expect(out.text).not.toContain(':::warning');
    expect(out.text).not.toContain(':::caution');
  });

  it('preserves Material footnotes through the pipeline (remark-gfm passthrough)', () => {
    const map = fixture(['index.md']);
    const source = [
      'A paragraph with a reference.[^1]',
      '',
      '[^1]: This is the footnote body.',
      '',
    ].join('\n');
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain('[^1]');
    expect(out.text).toContain('This is the footnote body.');
    expect(out.diagnostics).toEqual([]);
  });

  it('preserves multi-paragraph indented footnote definitions', () => {
    const map = fixture(['index.md']);
    const source = [
      'See note.[^big]',
      '',
      '[^big]:',
      '    First paragraph of the footnote.',
      '',
      '    Second paragraph, still inside.',
      '',
    ].join('\n');
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain('[^big]');
    expect(out.text).toContain('First paragraph of the footnote.');
    expect(out.text).toContain('Second paragraph');
  });

  it('rewrites pymdownx.blocks.details into <details><summary> via the admonition pipeline', () => {
    const map = fixture(['index.md']);
    const source = '/// details | Click for more\nHidden body.\n///\n';
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toMatch(/<details>/);
    expect(out.text).toMatch(/<summary>Click for more<\/summary>/);
    expect(out.text).toContain('Hidden body.');
    expect(out.text).toMatch(/<\/details>/);
    expect(out.text).not.toContain('///');
    expect(out.text).not.toContain(':::details');
  });

  it('emits <figcaption> for /// caption blocks', () => {
    const map = fixture(['index.md']);
    const source = '![Diagram](diagram.png)\n\n/// caption\nSystem overview.\n///\n';
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain('<figcaption>System overview.</figcaption>');
    expect(out.text).not.toContain('///');
    expect(out.text).not.toContain(':::caption');
  });

  it('strips /// define wrapper and renders the inner definition list as <dl>', () => {
    const map = fixture(['index.md']);
    const source = '/// define\nApple\n:   A red fruit.\n///\n';
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain('<dl>');
    expect(out.text).toContain('<dt>Apple</dt>');
    expect(out.text).toContain('<dd>A red fruit.</dd>');
    expect(out.text).not.toContain('///');
    expect(out.text).not.toContain(':::define');
  });

  it('preserves arithmatex inline math markers ($x = 1$) verbatim', () => {
    const map = fixture(['index.md']);
    const source = 'The kernel is $\\ker f$ and the image is $\\operatorname{im} f$.\n';
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain('$\\ker f$');
    expect(out.text).toContain('$\\operatorname{im} f$');
  });

  it('preserves arithmatex block math ($$ ... $$) verbatim', () => {
    const map = fixture(['index.md']);
    const source = [
      'Before.',
      '',
      '$$',
      '\\cos x = \\sum_{k=0}^{\\infty} \\frac{(-1)^k}{(2k)!} x^{2k}',
      '$$',
      '',
      'After.',
      '',
    ].join('\n');
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    expect(out.text).toContain('$$');
    expect(out.text).toContain('\\cos x');
    expect(out.text).toContain('\\sum_{k=0}^{\\infty}');
    expect(out.text).toContain('After.');
  });

  it('honors /// admonition type: warning option end-to-end through the pipeline', () => {
    const map = fixture(['index.md']);
    const source = [
      '/// admonition | Heads up',
      '    type: warning',
      'body.',
      '///',
      '',
    ].join('\n');
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    // Material `warning` maps to Starlight `caution` per the conversion
    // mapping; the type:-overridden block must traverse the full pipeline.
    expect(out.text).toMatch(/:::caution|<aside[^>]*caution/);
    expect(out.text).toContain('Heads up');
    expect(out.text).toContain('body.');
    expect(out.text).not.toContain('///');
    expect(out.text).not.toContain('type:');
  });

  it('rewrites pymdownx.blocks.* /// note alongside legacy admonitions', () => {
    const map = fixture(['index.md']);
    const source = [
      '/// warning | Modern',
      'Block syntax.',
      '///',
      '',
    ].join('\n');
    const out = convertFile({ source, sourcePath: 'index.md', slugMap: map });
    // Material warning maps to Starlight caution per the conversion mapping.
    expect(out.text).toMatch(/:::caution|<aside[^>]*caution/);
    expect(out.text).toContain('Block syntax.');
    expect(out.text).not.toContain('///');
  });
});

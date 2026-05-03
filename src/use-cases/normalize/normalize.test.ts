import { describe, expect, it } from 'vitest';
import { normalize } from './normalize.js';
import { normalizeAdmonitions } from './admonitions.js';
import { normalizeContentTabs } from './content-tabs.js';

describe('normalize (composed pre-parse pipeline)', () => {
  it('passes through plain markdown unchanged', () => {
    const src = '# Title\n\nA paragraph.\n';
    expect(normalize(src)).toBe(src);
  });

  it('rewrites admonitions and content tabs in the same pass', () => {
    const src = [
      '!!! note "Setup"',
      '    Read this first.',
      '',
      '=== "macOS"',
      '    brew install foo',
      '',
      '=== "Linux"',
      '    apt install foo',
      '',
    ].join('\n');
    const out = normalize(src);
    expect(out).toContain(':::note[Setup]');
    expect(out).toContain('Read this first.');
    expect(out).toContain(':::tabs');
    expect(out).toContain(':::tab[macOS]');
    expect(out).toContain(':::tab[Linux]');
  });

  it('produces identical output regardless of which normalizer runs first', () => {
    const src = [
      '!!! warning "Heads up"',
      '    Check this.',
      '',
      '=== "C"',
      '    code',
      '',
      '=== "C++"',
      '    code',
      '',
    ].join('\n');
    const adminFirst = normalizeContentTabs(normalizeAdmonitions(src));
    const tabsFirst = normalizeAdmonitions(normalizeContentTabs(src));
    expect(adminFirst).toBe(tabsFirst);
  });

  it('is idempotent on the composed output', () => {
    const src = '!!! note\n    body\n\n=== "T"\n    body\n';
    const once = normalize(src);
    expect(normalize(once)).toBe(once);
  });

  it('shields fenced code from both normalizers', () => {
    const src = [
      '```',
      '!!! note',
      '    body',
      '=== "tab"',
      '    body',
      '```',
      '',
    ].join('\n');
    expect(normalize(src)).toBe(src);
  });

  it('downgrades Material code annotations: strips .annotate, drops the bang from (N)!', () => {
    const src = [
      '``` { .python .annotate }',
      'print("hi")  # (1)!',
      '```',
      '',
      '1.  This is the annotation.',
      '',
    ].join('\n');
    const out = normalize(src);
    expect(out).not.toContain('.annotate');
    expect(out).toContain('# (1)');
    expect(out).not.toContain('(1)!');
    expect(out).toContain('1.  This is the annotation.');
  });

  it('downgrades Material annotations to footnote refs/defs', () => {
    const src = [
      'See marker (1) here.',
      '{ .annotate }',
      '',
      '1.  Annotation body.',
      '',
    ].join('\n');
    const out = normalize(src);
    expect(out).toContain('[^anno-1-1]');
    expect(out).toContain('[^anno-1-1]: Annotation body.');
    expect(out).not.toContain('{ .annotate }');
  });

  it('rewrites Critic Markup before bare ==mark==, so {==…==} is not double-processed', () => {
    const src = 'Critic {==important==} and bare ==also== noted.\n';
    const out = normalize(src);
    expect(out).toContain('<mark>important</mark>');
    expect(out).toContain('<mark>also</mark>');
    expect(out).not.toContain('{==');
    expect(out).not.toContain('==}');
  });

  it('strips Material abbreviation definitions and wraps occurrences with <abbr>', () => {
    const src = [
      'The HTML standard is maintained by the W3C.',
      '',
      '*[HTML]: Hyper Text Markup Language',
      '*[W3C]: World Wide Web Consortium',
      '',
    ].join('\n');
    const out = normalize(src);
    expect(out).toContain('<abbr title="Hyper Text Markup Language">HTML</abbr>');
    expect(out).toContain('<abbr title="World Wide Web Consortium">W3C</abbr>');
    expect(out).not.toContain('*[HTML]:');
    expect(out).not.toContain('*[W3C]:');
  });

  it('rewrites Python-Markdown definition lists into <dl> HTML', () => {
    const src = [
      'Apple',
      ':   A red fruit.',
      '',
    ].join('\n');
    const out = normalize(src);
    expect(out).toContain('<dl>');
    expect(out).toContain('<dt>Apple</dt>');
    expect(out).toContain('<dd>A red fruit.</dd>');
    expect(out).toContain('</dl>');
    expect(out).not.toContain(':   A red fruit.');
  });

  it('rewrites Material .md-button links into anchors with class', () => {
    const src = 'Click [Subscribe](https://example.com){ .md-button .md-button--primary } now.\n';
    const out = normalize(src);
    expect(out).toContain('<a href="https://example.com" class="md-button md-button--primary">Subscribe</a>');
    expect(out).not.toContain('.md-button');
  });

  it('rewrites pymdownx.blocks.* fenced syntax alongside legacy admonitions', () => {
    const src = [
      '/// note | Modern',
      'New syntax.',
      '///',
      '',
      '!!! warning "Legacy"',
      '    Old syntax.',
      '',
    ].join('\n');
    const out = normalize(src);
    expect(out).toContain(':::note[Modern]');
    expect(out).toContain('New syntax.');
    expect(out).toContain(':::warning[Legacy]');
    expect(out).toContain('Old syntax.');
  });
});

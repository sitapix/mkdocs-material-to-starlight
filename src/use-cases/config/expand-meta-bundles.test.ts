import { describe, expect, it } from 'vitest';
import { expandMetaBundles } from './expand-meta-bundles.js';
import type { MkdocsMarkdownExtension } from '../../domain/config/mkdocs-config.js';

const ext = (name: string, options: Record<string, unknown> = {}): MkdocsMarkdownExtension => ({
  name,
  options,
});

describe('expandMetaBundles', () => {
  it('returns input unchanged when no meta bundle is present', () => {
    const input = [ext('admonition'), ext('attr_list')];
    expect(expandMetaBundles(input)).toEqual(input);
  });

  it('expands pymdownx.extra into its 8 component extensions', () => {
    const input = [ext('pymdownx.extra')];
    const output = expandMetaBundles(input);
    const names = output.map((e) => e.name);
    expect(names).toContain('pymdownx.betterem');
    expect(names).toContain('pymdownx.superfences');
    expect(names).toContain('footnotes');
    expect(names).toContain('attr_list');
    expect(names).toContain('def_list');
    expect(names).toContain('tables');
    expect(names).toContain('abbr');
    expect(names).toContain('md_in_html');
    expect(names).not.toContain('pymdownx.extra');
  });

  it('preserves other extensions when expanding the bundle', () => {
    const input = [ext('admonition'), ext('pymdownx.extra'), ext('pymdownx.snippets')];
    const output = expandMetaBundles(input);
    const names = output.map((e) => e.name);
    expect(names).toContain('admonition');
    expect(names).toContain('pymdownx.snippets');
    expect(names).toContain('pymdownx.betterem');
  });

  it('does not duplicate extensions already present alongside the bundle', () => {
    const input = [ext('attr_list'), ext('pymdownx.extra')];
    const output = expandMetaBundles(input);
    const attrCount = output.filter((e) => e.name === 'attr_list').length;
    expect(attrCount).toBe(1);
  });

  it('idempotent: a second pass over expanded output is a no-op', () => {
    const input = [ext('pymdownx.extra')];
    const once = expandMetaBundles(input);
    const twice = expandMetaBundles(once);
    expect(twice).toEqual(once);
  });
});

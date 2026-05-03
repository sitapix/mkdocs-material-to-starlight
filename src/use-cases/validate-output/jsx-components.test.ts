import { describe, expect, it } from 'vitest';
import { validateJsxComponents } from './jsx-components.js';

describe('validateJsxComponents', () => {
  it('returns no diagnostics for plain Markdown with no JSX', () => {
    const src = '# Heading\n\nA paragraph with **bold** and `code`.\n';
    expect(validateJsxComponents(src, 'page.md')).toEqual([]);
  });

  it('does not validate .md files even when they contain JSX-like text', () => {
    const src = '# Heading\n\n<Aside>This is .md so JSX is irrelevant.</Aside>\n';
    expect(validateJsxComponents(src, 'page.md')).toEqual([]);
  });

  it('returns no diagnostics for an .mdx file using only Starlight built-ins', () => {
    const src = [
      "import { Aside, Tabs, TabItem, Card } from '@astrojs/starlight/components';",
      '',
      '<Aside type="note">Hello</Aside>',
      '',
      '<Tabs><TabItem label="A">x</TabItem></Tabs>',
      '<Card title="Hi">body</Card>',
      '',
    ].join('\n');
    expect(validateJsxComponents(src, 'page.mdx')).toEqual([]);
  });

  it('flags an .mdx file that uses an unknown JSX component', () => {
    const src = '<MyMystery>body</MyMystery>\n';
    const diagnostics = validateJsxComponents(src, 'page.mdx');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('unknown-jsx-component');
    expect(diagnostics[0]?.message).toContain('<MyMystery>');
    expect(diagnostics[0]?.message).toContain('page.mdx');
  });

  it('does not flag a custom component when it is named-imported in the file', () => {
    const src = [
      "import { MyComponent } from '../components/MyComponent.astro';",
      '',
      '<MyComponent>body</MyComponent>',
      '',
    ].join('\n');
    expect(validateJsxComponents(src, 'page.mdx')).toEqual([]);
  });

  it('honors `as` aliases in named imports', () => {
    const src = [
      "import { Foo as Bar } from './x';",
      '',
      '<Bar />',
      '',
    ].join('\n');
    expect(validateJsxComponents(src, 'page.mdx')).toEqual([]);
  });

  it('flags every distinct unknown component once (not once per usage)', () => {
    const src = '<Mystery /><Mystery /><Other />\n';
    const diagnostics = validateJsxComponents(src, 'page.mdx');
    const names = diagnostics.map((d) => d.message);
    expect(names.length).toBe(2);
    expect(names.some((m) => m.includes('<Mystery>'))).toBe(true);
    expect(names.some((m) => m.includes('<Other>'))).toBe(true);
  });

  it('does not flag lowercase HTML elements', () => {
    const src = '<div><span>hi</span><a href="x">link</a></div>\n';
    expect(validateJsxComponents(src, 'page.mdx')).toEqual([]);
  });

  it('also validates .mdoc files', () => {
    const src = '<Mystery />\n';
    expect(validateJsxComponents(src, 'page.mdoc').length).toBe(1);
  });

  it('handles dotted member access by validating the root', () => {
    const src = [
      "import { Foo } from './x';",
      '',
      '<Foo.Sub>body</Foo.Sub>',
      '',
    ].join('\n');
    expect(validateJsxComponents(src, 'page.mdx')).toEqual([]);
  });
});

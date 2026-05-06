import { describe, expect, it } from 'vitest';
import { detectMdxNeeds } from './detect.js';

describe('detectMdxNeeds', () => {
  it('plain markdown → md', () => {
    const out = detectMdxNeeds('# Heading\n\nBody.\n');
    expect(out.extension).toBe('md');
    expect(out.usedComponents).toEqual([]);
  });

  it('starts with import → mdx', () => {
    const out = detectMdxNeeds(
      "import { Steps } from '@astrojs/starlight/components';\n\n# Title\n",
    );
    expect(out.extension).toBe('mdx');
    expect(out.reasons).toContain('import-statement');
  });

  it('contains PascalCase JSX → mdx', () => {
    const out = detectMdxNeeds(
      '# Title\n\n<MyHero foo="bar" />\n',
    );
    expect(out.extension).toBe('mdx');
    expect(out.reasons).toContain('jsx-component');
  });

  it('contains Starlight Aside component → mdx with usedComponents=[Aside]', () => {
    const out = detectMdxNeeds(
      '# Title\n\n<Aside type="tip">Body</Aside>\n',
    );
    expect(out.extension).toBe('mdx');
    expect(out.usedComponents).toContain('Aside');
  });

  it('detects multiple Starlight built-ins', () => {
    const src = `# Title

<Steps>
  <Card title="Step 1">First</Card>
  <Tabs>
    <TabItem label="A">a</TabItem>
  </Tabs>
</Steps>
`;
    const out = detectMdxNeeds(src);
    expect(out.usedComponents).toEqual(
      expect.arrayContaining(['Steps', 'Card', 'Tabs', 'TabItem']),
    );
  });

  it('does NOT promote on lowercase HTML tags', () => {
    expect(detectMdxNeeds('<div>x</div>\n').extension).toBe('md');
    expect(detectMdxNeeds('<sub>2</sub>\n').extension).toBe('md');
  });

  it('does NOT promote on raw self-closing div with class attr', () => {
    expect(
      detectMdxNeeds('<div class="grid cards" markdown>\n- item\n</div>\n').extension,
    ).toBe('md');
  });

  it('treats frontmatter expressions as mdx (Astro literal-only, not MD)', () => {
    const out = detectMdxNeeds(
      '---\ntitle: X\n---\n\n{frontmatter.title}\n',
    );
    expect(out.extension).toBe('mdx');
    expect(out.reasons).toContain('frontmatter-expression');
  });

  it('idempotent: detecting on the same source twice yields same answer', () => {
    const src = '<Card title="x">y</Card>';
    expect(detectMdxNeeds(src)).toEqual(detectMdxNeeds(src));
  });

  it('emits the reasons array sorted and unique', () => {
    const out = detectMdxNeeds(
      "import x from 'y';\n\n<Aside>a</Aside>\n",
    );
    expect(out.reasons).toContain('import-statement');
    expect(out.reasons).toContain('jsx-component');
    // No duplicates.
    expect(new Set(out.reasons).size).toBe(out.reasons.length);
  });

  it('does not flag inline backtick code that contains <Tag>', () => {
    expect(detectMdxNeeds('Use `<MyComponent>` to ...').extension).toBe('md');
  });

  it('does not flag fenced code blocks containing <Tag>', () => {
    const src = '```html\n<MyComponent />\n```\n';
    expect(detectMdxNeeds(src).extension).toBe('md');
  });

  it('does not treat hyphenated placeholders like <EXTERNAL-IP> as JSX components', () => {
    // Real regression from khomesh24/docs Minikube article — kubectl-style
    // angle-bracket placeholders. They're not valid JSX (hyphens aren't
    // legal in component identifiers), and promoting the file to .mdx
    // produces an unparseable output.
    const src = '# Title\n\nYour deployment is at <EXTERNAL-IP>:8080\n';
    const out = detectMdxNeeds(src);
    expect(out.extension).toBe('md');
    expect(out.usedComponents).toEqual([]);
  });

  it('does not flag bare uppercase words inside angle brackets used as prose', () => {
    // <NAME>, <EMAIL>, <URL> — common documentation placeholders.
    const src = '# Title\n\nReplace <NAME> with your name.\n';
    expect(detectMdxNeeds(src).extension).toBe('md');
  });

  it('still detects a self-closing JSX component', () => {
    const src = '# Title\n\n<MyHero/>\n';
    expect(detectMdxNeeds(src).extension).toBe('mdx');
  });

  it('still detects a JSX component with attributes', () => {
    const src = '# Title\n\n<MyHero className="x" />\n';
    expect(detectMdxNeeds(src).extension).toBe('mdx');
  });
});

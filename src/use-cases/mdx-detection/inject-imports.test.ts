import { describe, expect, it } from 'vitest';
import { injectStarlightImports } from './inject-imports.js';

describe('injectStarlightImports', () => {
  it('returns source unchanged when no Starlight components used', () => {
    const src = '# Title\n\nBody.\n';
    expect(injectStarlightImports(src, [])).toBe(src);
  });

  it('returns source unchanged when only non-Starlight components used', () => {
    const src = '# Title\n\n<MyHero />\n';
    expect(injectStarlightImports(src, ['MyHero'])).toBe(src);
  });

  it('prepends single import for one Starlight component', () => {
    const out = injectStarlightImports('# Title\n\n<Aside>x</Aside>\n', ['Aside']);
    expect(out).toContain("import { Aside } from '@astrojs/starlight/components';");
    expect(out.indexOf('import')).toBeLessThan(out.indexOf('# Title'));
  });

  it('aggregates multiple components into a single import', () => {
    const out = injectStarlightImports(
      '# T\n\n<Tabs><TabItem>a</TabItem></Tabs>\n<Aside>b</Aside>\n',
      ['Tabs', 'TabItem', 'Aside'],
    );
    const importLine = out.split('\n').find((l) => l.startsWith('import'));
    expect(importLine).toBeDefined();
    // Components appear sorted in the destructuring.
    expect(importLine).toContain('Aside');
    expect(importLine).toContain('TabItem');
    expect(importLine).toContain('Tabs');
  });

  it('preserves frontmatter when injecting after the closing ---', () => {
    const src = '---\ntitle: X\n---\n\n<Aside>a</Aside>\n';
    const out = injectStarlightImports(src, ['Aside']);
    // Frontmatter intact.
    expect(out.startsWith('---\ntitle: X\n---\n')).toBe(true);
    // Import lives after frontmatter, before body.
    const importIdx = out.indexOf('import');
    const fmEnd = out.indexOf('---\n', 4) + '---\n'.length;
    expect(importIdx).toBeGreaterThanOrEqual(fmEnd);
  });

  it('emits a BLANK LINE between the import and the body content (MDX hygiene)', () => {
    // Real-world bug: pydantic install.mdx ended up with the import
    // immediately followed by body text, e.g.
    //   import { Tabs } from '...';
    //   Installation is as simple as:
    // MDX accepts this, but tooling (and astro's MDX parser) is happier with
    // an explicit blank line. The injector must produce:
    //   import { Tabs } from '...';
    //
    //   Installation is as simple as:
    const src = '---\ntitle: X\n---\n\nInstallation is as simple as:\n\n<Tabs></Tabs>\n';
    const out = injectStarlightImports(src, ['Tabs']);
    const lines = out.split('\n');
    const importIdx = lines.findIndex((l) => l.startsWith('import '));
    expect(importIdx).toBeGreaterThanOrEqual(0);
    // The line immediately after the import must be empty (or a continuation
    // import). Body content directly on the next line is the bug.
    const nextLine = lines[importIdx + 1] ?? '';
    expect(nextLine).toBe('');
  });

  it('also emits a blank line when no frontmatter is present', () => {
    const out = injectStarlightImports('<Card>x</Card>\n', ['Card']);
    const lines = out.split('\n');
    const importIdx = lines.findIndex((l) => l.startsWith('import '));
    const nextLine = lines[importIdx + 1] ?? '';
    expect(nextLine).toBe('');
  });

  it('does not inject when import line already present', () => {
    const src = "import { Aside } from '@astrojs/starlight/components';\n\n<Aside>x</Aside>\n";
    const out = injectStarlightImports(src, ['Aside']);
    // Only one import line.
    const matches = out.split('\n').filter((l) => l.startsWith('import')).length;
    expect(matches).toBe(1);
  });

  it('idempotent', () => {
    const src = '<Card title="x">y</Card>\n';
    const first = injectStarlightImports(src, ['Card']);
    const second = injectStarlightImports(first, ['Card']);
    expect(second).toBe(first);
  });

  it('ignores unknown component names that are not Starlight built-ins', () => {
    const out = injectStarlightImports('<MyHero />\n', ['MyHero', 'Aside']);
    const importLine = out.split('\n').find((l) => l.startsWith('import')) ?? '';
    expect(importLine).toContain('Aside');
    expect(importLine).not.toContain('MyHero');
    expect(out).toContain('<MyHero />');
  });
});

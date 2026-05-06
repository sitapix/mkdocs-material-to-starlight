import { describe, expect, it } from 'vitest';
import { serializeContentConfig } from './content-config.js';

describe('serializeContentConfig', () => {
  it('emits a valid TS module that defines the docs collection with docsLoader and docsSchema', () => {
    // Without an explicit src/content.config.ts, Astro v5 auto-generates a
    // glob-based content collection that does not match what Starlight's
    // sidebar slug resolver expects. The result is `astro build` failing
    // with "The slug X does not exist" on every entry. Emitting an explicit
    // content config wired to docsLoader fixes this.
    const out = serializeContentConfig();
    expect(out).toContain(`from 'astro:content'`);
    expect(out).toContain(`from '@astrojs/starlight/loaders'`);
    expect(out).toContain(`from '@astrojs/starlight/schema'`);
    expect(out).toContain('defineCollection');
    expect(out).toContain('docsLoader()');
    expect(out).toContain('docsSchema(');
    expect(out).toContain('docs:');
  });

  it('emits a module with `export const collections`', () => {
    const out = serializeContentConfig();
    expect(out).toContain('export const collections');
  });

  it('emits output that ends with a newline', () => {
    const out = serializeContentConfig();
    expect(out.endsWith('\n')).toBe(true);
  });

  it('emits a bare docsSchema() when no extra fields are provided', () => {
    const out = serializeContentConfig({});
    // No `extend:` block, no zod import.
    expect(out).toContain('schema: docsSchema(),');
    expect(out).not.toContain("from 'astro/zod'");
    expect(out).not.toContain('extend:');
  });

  it('emits docsSchema({ extend }) when unknown frontmatter fields are passed', () => {
    // Real-world: zbghost325/XRIML-WIKI uses `tags`, `date`, `version` across
    // 30+ pages. Auto-extending the generated content.config.ts means the
    // build works out of the box; users tighten types only if they want to.
    const out = serializeContentConfig({
      tags: 'z.array(z.string()).optional()',
      date: 'z.coerce.date().optional()',
      version: 'z.string().optional()',
    });
    expect(out).toContain("import { z } from 'astro/zod';");
    expect(out).toContain('schema: docsSchema({');
    expect(out).toContain('extend: z.object({');
    expect(out).toContain('tags: z.array(z.string()).optional(),');
    expect(out).toContain('date: z.coerce.date().optional(),');
    expect(out).toContain('version: z.string().optional(),');
  });

  it('quotes field names that aren\'t valid JS identifiers (hyphens, leading digits, etc.)', () => {
    // Real-world (iolanta-tech/python-yaml-ld, tbklang/documentation):
    // sources use kebab-case frontmatter fields like `header-includes`
    // and `is-blocked-by`. Emitting them as bare TS identifiers
    // (`header-includes: z...`) crashes esbuild with `Expected "}" but
    // found "-"`. Quoting makes the property key a valid string literal.
    const out = serializeContentConfig({
      'header-includes': 'z.unknown().optional()',
      'is-blocked-by': 'z.string().optional()',
      author: 'z.string().optional()',
    });
    expect(out).toContain('"header-includes": z.unknown().optional(),');
    expect(out).toContain('"is-blocked-by": z.string().optional(),');
    // Plain identifiers stay unquoted.
    expect(out).toContain('author: z.string().optional(),');
  });

  it('orders extended field names alphabetically for stable output', () => {
    // Idempotency: running the converter twice on the same input must produce
    // the same content.config.ts. Sort the field list deterministically.
    const out = serializeContentConfig({
      zeta: 'z.string().optional()',
      alpha: 'z.string().optional()',
      mu: 'z.string().optional()',
    });
    const alphaIdx = out.indexOf('alpha:');
    const muIdx = out.indexOf('mu:');
    const zetaIdx = out.indexOf('zeta:');
    expect(alphaIdx).toBeLessThan(muIdx);
    expect(muIdx).toBeLessThan(zetaIdx);
  });
});

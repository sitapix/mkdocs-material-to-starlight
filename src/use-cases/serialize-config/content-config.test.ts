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

  it("quotes field names that aren't valid JS identifiers (hyphens, leading digits, etc.)", () => {
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

  it('emits docsLoader() with no generateId by default', () => {
    // Default behaviour: rely on Starlight's built-in github-slugger. Only
    // sites with slug-incompatible source paths need the override.
    const out = serializeContentConfig();
    expect(out).toContain('docsLoader()');
    expect(out).not.toContain('generateId');
  });

  it('emits docsLoader({ generateId }) when preserveSlugs is true', () => {
    // Starlight 0.35+ added a generateId option that lets the converter
    // bypass github-slugger's strip behaviour. When source paths contain
    // segments github-slugger would reshape (`1.0/`, `c++-primer.md`),
    // emitting a path-preserving generateId lets the sidebar entries
    // resolve verbatim — replacing the previous slug-incompatible-path
    // warning with an actual fix.
    const out = serializeContentConfig({}, { preserveSlugs: true });
    expect(out).toContain('docsLoader({');
    expect(out).toContain('generateId');
    // The function must strip the .md/.mdx extension and the trailing
    // /index or /readme suffix, lowercase the rest, and preserve every
    // other character.
    expect(out).toMatch(/\.md\|mdx|md\|mdx/);
    expect(out).toMatch(/index|readme/i);
  });

  it('composes blogSchema into docsSchema({ extend }) when includeBlogSchema is true', () => {
    // Field-tested regression (squidfunk/mkdocs-material docs, 2026-07-23):
    // without blogSchema composed, blog post `date` frontmatter stays a raw
    // string and starlight-blog's prerender sort crashes `astro build` with
    // "b.data.date.getTime is not a function".
    const out = serializeContentConfig({}, { includeBlogSchema: true });
    expect(out).toContain(`import { blogSchema } from 'starlight-blog/schema';`);
    expect(out).toContain('blogSchema(context).merge(');
    // The converter's normalizer quotes date-like frontmatter values, so
    // blogSchema's `z.date()` alone would reject every post — the emitted
    // schema re-declares date with coercion.
    expect(out).toContain('date: z.coerce.date().optional(),');
    expect(out).toContain("import { z } from 'astro/zod';");
  });

  it('merges surviving inferred fields alongside blogSchema', () => {
    const out = serializeContentConfig(
      { icon: 'z.string().optional()', readtime: 'z.number().optional()' },
      { includeBlogSchema: true },
    );
    expect(out).toContain(`import { blogSchema } from 'starlight-blog/schema';`);
    expect(out).toContain("import { z } from 'astro/zod';");
    expect(out).toContain('blogSchema(context).merge(');
    expect(out).toContain('icon: z.string().optional(),');
    expect(out).toContain('readtime: z.number().optional(),');
  });

  it('drops inferred fields that blogSchema already declares so the merge cannot clobber its coercions', () => {
    // `.merge()` lets the right-hand object win. An inferred
    // `date: z.unknown()` merged on top of blogSchema would undo the
    // string→Date coercion and recreate the exact crash this composition
    // fixes — same for authors/tags/cover/excerpt/metrics/featured.
    const out = serializeContentConfig(
      {
        date: 'z.unknown().optional()',
        authors: 'z.array(z.string()).optional()',
        tags: 'z.array(z.string()).optional()',
        icon: 'z.string().optional()',
      },
      { includeBlogSchema: true },
    );
    expect(out).not.toContain('date: z.unknown()');
    expect(out).not.toContain('authors: z.array');
    expect(out).not.toContain('tags: z.array');
    expect(out).toContain('icon: z.string().optional(),');
  });

  it('keeps blog-owned field names in the extend when blog is NOT detected', () => {
    // The filter is strictly scoped to blogSchema composition: a non-blog
    // site whose pages use `date`/`tags` frontmatter still gets those
    // inferred fields (there is no schema to clash with).
    const out = serializeContentConfig({ date: 'z.unknown().optional()' });
    expect(out).toContain('date: z.unknown().optional(),');
    expect(out).not.toContain('blogSchema');
  });

  it('composes blogSchema with preserveSlugs (generateId) in the same emission', () => {
    const out = serializeContentConfig({}, { includeBlogSchema: true, preserveSlugs: true });
    expect(out).toContain('generateId');
    expect(out).toContain('blogSchema(context).merge(');
  });

  it('preserves docsSchema() emission when preserveSlugs is true', () => {
    // The two options compose: a site can both override the slug derivation
    // and extend the frontmatter schema with custom fields.
    const out = serializeContentConfig(
      { tags: 'z.array(z.string()).optional()' },
      { preserveSlugs: true },
    );
    expect(out).toContain('generateId');
    expect(out).toContain('schema: docsSchema({');
    expect(out).toContain('extend: z.object({');
    expect(out).toContain('tags: z.array(z.string()).optional(),');
  });
});

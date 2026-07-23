/**
 * Serialize `src/content.config.ts` for the generated Starlight project.
 *
 * Pure: takes a record of `field → zodType` snippets and returns the TS
 * source. The interface layer writes the result.
 *
 * Astro v5 auto-generates a glob collection, but Starlight's sidebar slug
 * resolver needs a collection loaded via `docsLoader()` to resolve
 * `{ slug: 'foo' }`. Without this file, `astro build` fails with "The slug
 * X does not exist" on every sidebar entry.
 *
 * Source pages that use frontmatter fields outside Starlight's `docsSchema()`
 * (`tags`, `date`, `version`) cause Zod failures; auto-extending the schema
 * with inferred types lets converted projects build out of the box. Field
 * names are sorted for stable idempotent output.
 *
 * When `preserveSlugs` is true, emit Starlight 0.35+'s `generateId` option
 * on `docsLoader` so source path segments github-slugger would reshape
 * (`1.0/`, `c++-primer.md`) survive verbatim. This replaces the previous
 * `slug-incompatible-path` *warning* with an actual fix.
 */

export interface SerializeContentConfigOptions {
  /**
   * When true, emit a `generateId` function on `docsLoader` that derives the
   * entry's slug directly from its source path (lower-cased, extension
   * stripped, trailing /index|/readme stripped). Bypasses github-slugger so
   * paths like `1.0/configuration.md` and `c++-primer.md` survive without
   * the converter having to warn the user to rename or hand-edit.
   */
  readonly preserveSlugs?: boolean;
  /**
   * When true (blog feature detected), compose starlight-blog's
   * `blogSchema` into `docsSchema({ extend })`. Without it every blog
   * field stays a raw frontmatter value — most fatally `date`, which
   * starlight-blog sorts with `.getTime()` at prerender time, so
   * `astro build` crashes with "b.data.date.getTime is not a function"
   * on any site with dated posts (field-tested on squidfunk's
   * mkdocs-material docs, 2026-07-23). Inferred frontmatter fields that
   * `blogSchema` already declares are dropped so the merge cannot
   * clobber its coercions.
   */
  readonly includeBlogSchema?: boolean;
}

/**
 * Frontmatter fields owned by starlight-blog's `blogSchema` (0.28.0,
 * `blogEntrySchema` in its schema.ts). When the blog schema is composed,
 * inferred fields with these names must NOT be re-declared in the merged
 * `z.object` — `.merge()` lets the last declaration win, and e.g. an
 * inferred `date: z.unknown()` would undo `z.date()`'s string→Date
 * coercion, recreating the crash the composition exists to fix.
 */
const BLOG_SCHEMA_FIELDS: ReadonlySet<string> = new Set([
  'authors',
  'date',
  'excerpt',
  'metrics',
  'tags',
  'cover',
  'featured',
]);

export function serializeContentConfig(
  extendedFields: Readonly<Record<string, string>> = {},
  options: SerializeContentConfigOptions = {},
): string {
  const withBlog = options.includeBlogSchema === true;
  const fields = Object.keys(extendedFields)
    .filter((f) => !withBlog || !BLOG_SCHEMA_FIELDS.has(f))
    .sort();
  const baseImports = [
    `import { defineCollection } from 'astro:content';`,
    `import { docsLoader } from '@astrojs/starlight/loaders';`,
    `import { docsSchema } from '@astrojs/starlight/schema';`,
  ];
  if (withBlog) {
    baseImports.push(`import { blogSchema } from 'starlight-blog/schema';`);
  }

  const loaderInvocation =
    options.preserveSlugs === true ? renderDocsLoaderWithGenerateId() : 'docsLoader()';

  if (fields.length === 0 && !withBlog) {
    return [
      ...baseImports,
      ``,
      `export const collections = {`,
      `  docs: defineCollection({`,
      `    loader: ${loaderInvocation},`,
      `    schema: docsSchema(),`,
      `  }),`,
      `};`,
      ``,
    ].join('\n');
  }

  if (withBlog) {
    return [
      ...baseImports,
      `import { z } from 'astro/zod';`,
      ``,
      `export const collections = {`,
      `  docs: defineCollection({`,
      `    loader: ${loaderInvocation},`,
      `    schema: docsSchema({`,
      `      // starlight-blog needs its schema composed here; without it,`,
      `      // post \`date\` frontmatter never becomes a Date and astro`,
      `      // build crashes sorting posts. \`date\` is re-declared with`,
      `      // z.coerce.date() because the converter quotes date-like`,
      `      // frontmatter values during normalization — coercion accepts`,
      `      // both the quoted string and a bare YAML timestamp, and`,
      `      // starlight-blog still receives a real Date.`,
      `      extend: (context) =>`,
      `        blogSchema(context).merge(`,
      `          z.object({`,
      `            date: z.coerce.date().optional(),`,
      ...fields.map((f) => `            ${quoteFieldName(f)}: ${extendedFields[f]},`),
      `          }),`,
      `        ),`,
      `    }),`,
      `  }),`,
      `};`,
      ``,
    ].join('\n');
  }

  return [
    ...baseImports,
    `import { z } from 'astro/zod';`,
    ``,
    `export const collections = {`,
    `  docs: defineCollection({`,
    `    loader: ${loaderInvocation},`,
    `    schema: docsSchema({`,
    `      extend: z.object({`,
    ...fields.map((f) => `        ${quoteFieldName(f)}: ${extendedFields[f]},`),
    `      }),`,
    `    }),`,
    `  }),`,
    `};`,
    ``,
  ].join('\n');
}

/**
 * Build the JS source for `docsLoader({ generateId: ... })`. The generator
 * function takes the entry's content-relative path and returns a slug that
 * mirrors that path verbatim (lowercased, extension stripped, trailing
 * /index|/readme stripped). Preserves characters github-slugger would
 * otherwise drop (`.`, `+`, `&`, parens, etc.).
 *
 * Multi-line literal so the emitted file reads cleanly.
 */
function renderDocsLoaderWithGenerateId(): string {
  return [
    `docsLoader({`,
    `      // Bypass Starlight's default github-slugger so source paths with`,
    `      // characters the slugger would strip (\`1.0/\`, \`c++-primer.md\`,`,
    `      // ampersands, parens) survive verbatim and the converter's emitted`,
    `      // sidebar entries resolve. Generated by mkdocs-material-to-starlight`,
    `      // because slug-incompatible segments were detected in the source tree.`,
    `      generateId: ({ entry }) => {`,
    `        const noExt = entry.replace(/\\.(md|mdx)$/i, '');`,
    `        const lower = noExt.toLowerCase();`,
    `        return lower.replace(/(?:^|\\/)(?:index|readme)$/, (m) =>`,
    `          m.startsWith('/') ? '' : '',`,
    `        );`,
    `      },`,
    `    })`,
  ].join('\n');
}

/**
 * Quote a frontmatter field name when it isn't a valid JS identifier
 * (contains `-`, `:`, leading digit, etc.). Real-world (iolanta-tech and
 * tbklang projects use `header-includes`, `is-blocked-by`, etc.); without
 * quoting, the generated `content.config.ts` fails esbuild parsing with
 * `Expected "}" but found "-"`.
 */
function quoteFieldName(name: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return name;
  // JSON.stringify gives a properly-escaped double-quoted string.
  return JSON.stringify(name);
}

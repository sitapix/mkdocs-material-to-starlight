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
 */

export function serializeContentConfig(
  extendedFields: Readonly<Record<string, string>> = {},
): string {
  const fields = Object.keys(extendedFields).sort();
  const baseImports = [
    `import { defineCollection } from 'astro:content';`,
    `import { docsLoader } from '@astrojs/starlight/loaders';`,
    `import { docsSchema } from '@astrojs/starlight/schema';`,
  ];

  if (fields.length === 0) {
    return [
      ...baseImports,
      ``,
      `export const collections = {`,
      `  docs: defineCollection({`,
      `    loader: docsLoader(),`,
      `    schema: docsSchema(),`,
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
    `    loader: docsLoader(),`,
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

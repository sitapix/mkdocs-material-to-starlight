/**
 * Serialize the `src/content.config.ts` file for the generated Starlight
 * project.
 *
 * Pure: takes no inputs, returns the TS source. The caller (interface
 * layer) writes the result to `outputDir/src/content.config.ts`.
 *
 * Why this file exists. Astro v5 auto-generates a glob-based content
 * collection for `src/content/<name>/` folders that have no explicit
 * definition, but Starlight's sidebar slug resolver requires a collection
 * loaded via `docsLoader()` to resolve `{ slug: 'foo' }` entries against
 * the collection's IDs. Without this file, `astro build` fails with
 * "The slug X does not exist" on every sidebar entry.
 *
 * The emitted module is the canonical Starlight content-collection wiring
 * documented at https://starlight.astro.build/getting-started/.
 */

export function serializeContentConfig(): string {
  return [
    `import { defineCollection } from 'astro:content';`,
    `import { docsLoader } from '@astrojs/starlight/loaders';`,
    `import { docsSchema } from '@astrojs/starlight/schema';`,
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

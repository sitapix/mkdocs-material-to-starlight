/**
 * Typed shape of Starlight's frontmatter fields, lifted from the catalog at
 * `~/Documents/MkDocs_Material_Starlight_Catalog_20260501/`. This module is
 * the runtime-discoverable allowlist of field names that Starlight's
 * `docsSchema()` accepts — converted output that emits unknown frontmatter
 * keys without a matching `extend` will fail Astro's build with a Zod error.
 *
 * Pure data; no behavior. The validator (`use-cases/validate-output/
 * frontmatter.ts`) consumes this list to emit pre-flight diagnostics.
 */

export const STARLIGHT_FRONTMATTER_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'description',
  'slug',
  'editUrl',
  'head',
  'tableOfContents',
  'template',
  'hero',
  'banner',
  'lastUpdated',
  'prev',
  'next',
  'pagefind',
  'draft',
  'sidebar',
]);

/**
 * Allowlist of Starlight's built-in JSX components — every component callable
 * in `.mdx` after `import { ... } from '@astrojs/starlight/components'`.
 *
 * Lifted from the catalog at `~/Documents/MkDocs_Material_Starlight_Catalog_
 * 20260501/`. The validator (`use-cases/validate-output/jsx-components.ts`)
 * uses this set plus per-file imports to flag JSX usage that would break
 * Astro's build with an `Unknown component` error.
 *
 * Pure data; no behavior. Adding a component to Starlight's vocabulary is a
 * one-line change here, with the matching unit test for the validator.
 */

export const STARLIGHT_COMPONENTS: ReadonlySet<string> = new Set([
  'Aside',
  'Badge',
  'Card',
  'CardGrid',
  'Code',
  'FileTree',
  'Icon',
  'LinkButton',
  'LinkCard',
  'Steps',
  'Tabs',
  'TabItem',
]);

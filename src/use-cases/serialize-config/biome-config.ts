/**
 * Serialize a `biome.json` for the generated Starlight project.
 *
 * Pure: takes no inputs (the configuration is identical for every site we
 * generate). Returns the file content as a string. Idempotent — calling
 * twice produces byte-identical output.
 *
 * Biome covers everything in the Astro/Starlight scaffold that a user is
 * likely to hand-edit: `.astro` (HTML/CSS/JS/TS sub-blocks, since v2.3),
 * `.mjs` / `.ts` (astro.config + endpoint files), `.json` (package.json,
 * tsconfig), and `.css` (the migration stylesheet). Markdown and MDX are
 * NOT formatted — Biome has no Markdown parser, and the converter already
 * serializes those through remark-stringify with pinned options. The
 * config explicitly excludes `**\/*.md` / `**\/*.mdx` so a future Biome
 * release that adds Markdown support does not silently start re-flowing
 * the converter's output.
 *
 * Defaults match the Astro tooling guide
 * (https://astro-tips.dev/tips/biome/) and the official Biome v2.3 release
 * notes — single quotes for JS, double quotes for JSX attrs, 2-space tabs,
 * 100-char print width.
 */

const BIOME_SCHEMA_URL = 'https://biomejs.dev/schemas/2.3.0/schema.json';

export function serializeBiomeConfig(): string {
  const config = {
    $schema: BIOME_SCHEMA_URL,
    vcs: {
      enabled: true,
      clientKind: 'git',
      useIgnoreFile: true,
    },
    files: {
      includes: [
        '**/*.astro',
        '**/*.mjs',
        '**/*.cjs',
        '**/*.js',
        '**/*.jsx',
        '**/*.ts',
        '**/*.tsx',
        '**/*.json',
        '**/*.jsonc',
        '**/*.css',
        // Biome has no Markdown parser; exclude .md/.mdx so the
        // converter's remark-stringify output stays canonical.
        '!**/*.md',
        '!**/*.mdx',
        // Build/dependency artefacts.
        '!dist',
        '!node_modules',
        '!.astro',
        '!.cache',
        // The converter writes a per-site MIGRATION_NOTES.md alongside
        // generated config; never re-format it.
        '!MIGRATION_NOTES.md',
      ],
    },
    formatter: {
      enabled: true,
      indentStyle: 'space',
      indentWidth: 2,
      lineWidth: 100,
      lineEnding: 'lf',
    },
    linter: {
      enabled: true,
      rules: {
        recommended: true,
      },
    },
    javascript: {
      formatter: {
        quoteStyle: 'single',
        jsxQuoteStyle: 'double',
        semicolons: 'always',
        trailingCommas: 'all',
      },
    },
    json: {
      formatter: {
        trailingCommas: 'none',
      },
    },
    assist: {
      enabled: true,
      actions: {
        source: {
          organizeImports: 'on',
        },
      },
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

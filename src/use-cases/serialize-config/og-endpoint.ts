/**
 * Serialize the `src/pages/og/[...slug].png.ts` Astro endpoint that generates
 * one Open Graph card PNG per docs page.
 *
 * Pure: takes the migrated site name and returns the TypeScript source for an
 * Astro file route built on `astro-og-canvas`'s `OGImageRoute` helper. The
 * endpoint enumerates the `docs` content collection and produces a card per
 * entry. The `siteName` is wired as the default card subtitle so the output
 * has live data on day one.
 *
 * The scaffold is intentionally minimal — users are expected to customize
 * the card layout (logo, fonts, colors, padding) once `npm install` resolves
 * `astro-og-canvas`. The endpoint is the Material `social` plugin equivalent;
 * see `diagnose-plugins.ts` (`plugin-social-mapped`) for the migration note.
 *
 * NOT to be confused with Starlight's `social: []` config (header
 * social-media icon links), which is wired separately from `extra.social[]`
 * in mkdocs.yml.
 */

export interface OgEndpointInput {
  readonly siteName: string;
}

export function serializeOgEndpoint(input: OgEndpointInput): string {
  return [
    "import { OGImageRoute } from 'astro-og-canvas';",
    "import { getCollection } from 'astro:content';",
    '',
    "const docs = await getCollection('docs');",
    '',
    'const pages = Object.fromEntries(',
    '  docs.map((entry) => [',
    '    entry.id,',
    '    {',
    '      title: entry.data.title,',
    `      description: entry.data.description ?? ${quote(input.siteName)},`,
    '      // Customize: logo, bgGradient, font, padding, etc.',
    '      // See https://github.com/delucis/astro-og-canvas#options',
    '    },',
    '  ]),',
    ');',
    '',
    '// astro-og-canvas 0.11+ returns a Promise; await is required so the',
    '// resolved `getStaticPaths` is exported (Astro\'s static-route validator',
    '// rejects modules that re-export an unresolved Promise from a `[...slug]`',
    '// dynamic route).',
    'export const { getStaticPaths, GET } = await OGImageRoute({',
    "  param: 'slug',",
    '  pages,',
    '  getImageOptions: (_, page) => ({',
    '    title: page.title,',
    '    description: page.description,',
    '  }),',
    '});',
    '',
  ].join('\n');
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

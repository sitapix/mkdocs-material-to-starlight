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

import { translateOgCanvasOptions } from './og-canvas-options.js';

export interface OgEndpointInput {
  readonly siteName: string;
  /** Raw `plugins.social.cards_layout_options` from mkdocs.yml. Translated
   *  via `og-canvas-options.ts` into the `getImageOptions` literal so users
   *  who customized their Material social cards keep their colors/fonts
   *  on day one. Empty input → `getImageOptions` only emits title and
   *  description (legacy behavior). */
  readonly cardsLayoutOptions?: Readonly<Record<string, unknown>>;
}

export function serializeOgEndpoint(input: OgEndpointInput): string {
  const layoutLiteral = serializeLayoutLiteral(input.cardsLayoutOptions);
  // When layout options exist, splice them into `getImageOptions`'s return
  // record. Otherwise emit the bare title/description form.
  const getImageOptionsBody = layoutLiteral === ''
    ? '    title: page.title,\n    description: page.description,'
    : `    title: page.title,\n    description: page.description,\n${spreadLayout(layoutLiteral)}`;
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
    getImageOptionsBody,
    '  }),',
    '});',
    '',
  ].join('\n');
}

function serializeLayoutLiteral(opts: Readonly<Record<string, unknown>> | undefined): string {
  if (opts === undefined) return '';
  const literal = translateOgCanvasOptions(opts);
  return literal === '{}' ? '' : literal;
}

function spreadLayout(literal: string): string {
  // Strip outer braces, indent each comma-separated field by 4 spaces so
  // the resulting object literal stays clean and Prettier-stable.
  const inner = literal.slice(1, -1).trim();
  if (inner === '') return '';
  return inner
    .split(',')
    .map((p) => `    ${p.trim()}`)
    .join(',\n') + ',';
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

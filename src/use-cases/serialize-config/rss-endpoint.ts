/**
 * Serialize the `src/pages/rss.xml.ts` endpoint scaffold.
 *
 * Pure: takes the migrated site metadata and returns the TypeScript source
 * for an Astro RSS endpoint built on `@astrojs/rss`. The endpoint is wired
 * to the `docs` content collection and produces one feed item per page.
 *
 * The scaffold is intentionally minimal — users are expected to tweak the
 * description, link, and pubDate mappings to match their frontmatter. The
 * mkdocs-rss-plugin's `feed_meta`, `length`, `categories`, and `comments`
 * options have no automatic mapping (their semantics differ between the two
 * ecosystems); a diagnostic in MIGRATION_NOTES tells the user to set them
 * manually inside the rss() call.
 */

const DEFAULT_DESCRIPTION = 'RSS feed';

export interface RssEndpointInput {
  readonly siteName: string;
  readonly siteDescription: string | null;
  readonly siteUrl: string | null;
}

export function serializeRssEndpoint(input: RssEndpointInput): string {
  const description = input.siteDescription ?? DEFAULT_DESCRIPTION;
  const siteExpr =
    input.siteUrl === null
      ? 'context.site'
      : `context.site ?? ${quote(input.siteUrl)}`;
  return [
    "import rss from '@astrojs/rss';",
    "import { getCollection } from 'astro:content';",
    '',
    'export async function GET(context) {',
    "  const docs = await getCollection('docs');",
    '  return rss({',
    `    title: ${quote(input.siteName)},`,
    `    description: ${quote(description)},`,
    `    site: ${siteExpr},`,
    '    items: docs.map((entry) => ({',
    '      title: entry.data.title,',
    '      description: entry.data.description ?? "",',
    '      link: `/${entry.id}/`,',
    '      pubDate: entry.data.lastUpdated instanceof Date',
    '        ? entry.data.lastUpdated',
    '        : undefined,',
    '    })),',
    '  });',
    '}',
    '',
  ].join('\n');
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

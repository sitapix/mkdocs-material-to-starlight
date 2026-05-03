/**
 * Extract redirect mappings from the `mkdocs-redirects` plugin entry in
 * `mkdocs.yml` and translate them into Starlight/Astro slug pairs.
 *
 * MkDocs source shape:
 *
 *   plugins:
 *     - redirects:
 *         redirect_maps:
 *           old/page.md: new/page.md
 *           index.md: home/index.md
 *
 * Astro destination shape (in astro.config.mjs):
 *
 *   redirects: {
 *     '/old/page': '/new/page',
 *     '/': '/home',
 *   }
 *
 * Translation rules:
 *   - keys and values lose their `.md` suffix
 *   - keys/values become absolute paths (prepended with `/`)
 *   - `…/index.md` collapses to its parent directory (or `/` for top-level)
 *   - external URLs (anything starting with `http://`, `https://`, `//`) are
 *     passed through verbatim as the destination
 *
 * Pure: takes a plugin list, returns a redirect map.
 */

import type { MkdocsPlugin } from '../../domain/config/mkdocs-config.js';

export type RedirectMap = Readonly<Record<string, string>>;

export function extractRedirects(
  plugins: ReadonlyArray<MkdocsPlugin>,
): RedirectMap {
  const out: Record<string, string> = {};
  for (const plugin of plugins) {
    if (plugin.name !== 'redirects') {
      continue;
    }
    const raw = plugin.options['redirect_maps'];
    if (!isStringRecord(raw)) {
      continue;
    }
    for (const [from, to] of Object.entries(raw)) {
      if (typeof from !== 'string' || typeof to !== 'string') {
        continue;
      }
      out[normalizePath(from)] = isExternal(to) ? to : normalizePath(to);
    }
  }
  return out;
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExternal(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//');
}

function normalizePath(value: string): string {
  // Strip `.md` suffix and any trailing `/index` segment, prepend `/`.
  let path = value.replace(/\.md$/, '');
  path = path.replace(/(?:^|\/)index$/, '');
  if (path.length === 0) {
    return '/';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

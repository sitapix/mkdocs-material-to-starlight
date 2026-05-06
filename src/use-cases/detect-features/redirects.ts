/**
 * Extract redirects from the `mkdocs-redirects` plugin and translate to
 * Astro `redirects:` pairs.
 *
 * MkDocs:
 *   plugins:
 *     - redirects:
 *         redirect_maps:
 *           old/page.md: new/page.md
 *           index.md: home/index.md
 *
 * Astro:
 *   redirects: { '/old/page': '/new/page', '/': '/home' }
 *
 * Rules: drop `.md`, prepend `/`, collapse `…/index.md` to its parent
 * directory (or `/` for top-level), and pass through external URLs
 * (`http://`, `https://`, `//`) verbatim. Pure.
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

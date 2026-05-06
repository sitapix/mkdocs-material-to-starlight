/**
 * Rewrite a single Markdown link href into a Starlight-shaped href.
 *
 * Pure: takes (href, source path, slug map) and returns `RewrittenLink` or
 * `BrokenLink`. Callers walk the tree and apply this per link node.
 *
 * Five outcomes:
 *   - external (http/https/mailto): unchanged
 *   - fragment-only (#anchor): unchanged
 *   - relative .md / .mdx pointing to a known source: /slug[#fragment]
 *   - relative non-md (image, css, js): unchanged (copy stage handles them)
 *   - relative .md with no slug match: BrokenLink
 *
 * No I/O. POSIX path arithmetic (forward slashes throughout).
 */

import { ok, err, type Result } from '../../domain/result.js';
import type { SlugMap } from '../../domain/starlight/slug-map.js';

export interface RewriteInput {
  readonly href: string;
  readonly fromSourcePath: string;
  readonly slugMap: SlugMap;
}

export type RewrittenLink =
  | { readonly kind: 'external'; readonly href: string }
  | { readonly kind: 'fragment'; readonly href: string }
  | { readonly kind: 'internal'; readonly href: string }
  | { readonly kind: 'asset'; readonly href: string };

export interface BrokenLink {
  readonly code: 'broken-link';
  readonly target: string;
  readonly fromSourcePath: string;
}

export function rewriteInternalLink(
  input: RewriteInput,
): Result<RewrittenLink, BrokenLink> {
  const { href } = input;

  if (isExternal(href)) {
    return ok({ kind: 'external', href });
  }
  if (href.startsWith('#')) {
    return ok({ kind: 'fragment', href });
  }

  const split = splitFragment(href);
  if (!isMarkdownPath(split.path)) {
    return ok({ kind: 'asset', href: rewriteAssetHref(split, input.fromSourcePath) });
  }

  const targetSourcePath = decodePathSegments(
    resolveRelative(input.fromSourcePath, split.path),
  );
  const record = input.slugMap.getBySourcePath(targetSourcePath);
  if (record === undefined) {
    return err({
      code: 'broken-link',
      target: input.href,
      fromSourcePath: input.fromSourcePath,
    });
  }

  const rewritten = renderSlugUrl(record.slug, split.fragment);
  return ok({ kind: 'internal', href: rewritten });
}

function isExternal(href: string): boolean {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:')
  );
}

interface SplitHref {
  readonly path: string;
  readonly fragment: string | null;
}

function splitFragment(href: string): SplitHref {
  const hash = href.indexOf('#');
  if (hash === -1) {
    return { path: href, fragment: null };
  }
  // Strip a trailing `/` from the path part (Material sources sometimes
  // write `path.md/#anchor` — directory-style — instead of the canonical
  // `path.md#anchor`. Both refer to the same target).
  const path = href.slice(0, hash).replace(/\/$/, '');
  return { path, fragment: href.slice(hash) };
}

function isMarkdownPath(path: string): boolean {
  return path.endsWith('.md') || path.endsWith('.mdx');
}

function resolveRelative(fromSourcePath: string, target: string): string {
  if (target.startsWith('/')) {
    return target.replace(/^\//, '');
  }
  const fromDir = parentDirectory(fromSourcePath);
  const segments = (fromDir === '' ? [] : fromDir.split('/')).concat(target.split('/'));
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') {
      continue;
    }
    if (seg === '..') {
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join('/');
}

function parentDirectory(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

// Markdown link hrefs are HTTP-style percent-encoded (`%20`, `%C3%A4`); the
// slug map is keyed by literal filesystem paths. Decode each segment
// independently so a literal `%` in a filename survives, and a malformed
// sequence falls back to the raw segment instead of throwing.
function decodePathSegments(path: string): string {
  return path
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join('/');
}

function renderSlugUrl(slug: string, fragment: string | null): string {
  const path = slug === '' ? '/' : `/${slug}`;
  return fragment === null ? path : `${path}${fragment}`;
}

// Asset paths (images, CSS, JS, PDFs, etc.) get copied to `outputDir/public/`
// preserving their layout under `docs/`. To resolve correctly from any
// converted markdown file, the link must be a public-rooted absolute URL —
// otherwise it resolves against `src/content/docs/<page>/` and breaks.
function rewriteAssetHref(split: SplitHref, fromSourcePath: string): string {
  if (split.path.startsWith('/')) {
    return split.fragment === null ? split.path : `${split.path}${split.fragment}`;
  }
  const resolved = resolveRelative(fromSourcePath, split.path);
  const rooted = `/${resolved}`;
  return split.fragment === null ? rooted : `${rooted}${split.fragment}`;
}

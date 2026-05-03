/**
 * Rewrite a single Markdown link href into a Starlight-shaped href.
 *
 * Pure: takes a href + the source file's path + the slug map, returns either
 * a typed `RewrittenLink` or a typed `BrokenLink` error. The caller (an
 * AST-level transformer or the link-rewriter remark plugin) walks the tree
 * and applies this function to each link node.
 *
 * Five outcomes are possible:
 *   - external (http/https/mailto)             → passed through untouched
 *   - fragment-only (#anchor)                  → passed through untouched
 *   - relative .md / .mdx pointing to a known  → rewritten to /slug[#fragment]
 *     source file
 *   - relative non-md (image, css, js, etc.)   → kept as-is (asset path; copy
 *                                                 stage handles them)
 *   - relative .md pointing to nothing in the  → BrokenLink error
 *     slug map
 *
 * The function does no I/O. It uses POSIX-style path arithmetic (string ops),
 * since both MkDocs and Starlight conventions use forward slashes.
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

  const targetSourcePath = resolveRelative(input.fromSourcePath, split.path);
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
  return { path: href.slice(0, hash), fragment: href.slice(hash) };
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

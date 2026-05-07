/**
 * AST-level link transformer (remark plugin).
 *
 * Walks `link` and `image` nodes and rewrites their `url` via the pure
 * `rewriteInternalLink` use-case. Broken internal `.md` refs append to the
 * supplied diagnostics array; the link node stays intact so surrounding
 * Markdown remains parseable.
 *
 * Plugin contract:
 *   - Owns the `(link, *)` and `(image, *)` namespace cells.
 *   - Idempotent: hrefs already in `/slug` form stay as `/slug` (no `.md`,
 *     classified as `asset`).
 *   - Pure given the AST and injected slug map.
 *
 * Options: `fromSourcePath` (resolves relative refs), `slugMap` (run-wide),
 * `diagnostics` (sink; never throws).
 */

import type { Image, Link, Root } from 'mdast';
import type { Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import { createDiagnostic, type Diagnostic } from '../../../domain/diagnostics/diagnostic.js';
import type { SlugMap } from '../../../domain/starlight/slug-map.js';
import { rewriteInternalLink } from '../rewrite-links.js';

export interface LinkTransformOptions {
  readonly fromSourcePath: string;
  readonly slugMap: SlugMap;
  readonly diagnostics: Diagnostic[];
}

const SOURCE = 'mkdocs-material-to-starlight';

export const transformLinkNodes: Plugin<[LinkTransformOptions], Root> = (options) => {
  return (tree) => {
    // Include `definition` nodes so reference-style links (`[id]: url`)
    // and reference-style images get the same asset/internal-link
    // rewriting as inline links. Real-world break (orzih/mkdocs-with-pdf):
    // the source uses `[18]: assets/screenshots/creating-your-site.png`
    // and `![alt][18]` to share captions across pages — without rewriting
    // the definition, the relative path resolves under `src/content/docs/`
    // at build time and Vite errors with "Rollup failed to resolve import".
    visit(tree, ['link', 'image', 'definition'], (node, index, parent) => {
      const linkLike = node as Link | Image;
      if (typeof linkLike.url !== 'string') {
        return undefined;
      }
      const result = rewriteInternalLink({
        href: linkLike.url,
        fromSourcePath: options.fromSourcePath,
        slugMap: options.slugMap,
      });
      if (!result.ok) {
        options.diagnostics.push(toDiagnostic(linkLike, result.error.target));
        // Strip the broken link wrapper. The label text (children of a
        // `link` node) becomes plain inline content; an unresolvable image
        // is replaced by its alt text. This prevents starlight-links-
        // validator from rejecting the build at runtime while keeping
        // the human-readable text visible. The diagnostic above already
        // surfaced the lost target in MIGRATION_NOTES.md.
        if (parent !== undefined && index !== undefined) {
          if (linkLike.type === 'link') {
            (parent.children as unknown[]).splice(index, 1, ...(linkLike.children ?? []));
            return [SKIP, index];
          }
          if (linkLike.type === 'image') {
            // Image node: replace with its alt text (or drop entirely if empty).
            const alt = (linkLike as Image).alt ?? '';
            if (alt.length > 0) {
              (parent.children as unknown[]).splice(index, 1, {
                type: 'text',
                value: alt,
              });
            } else {
              (parent.children as unknown[]).splice(index, 1);
            }
            return [SKIP, index];
          }
          // `definition` nodes are top-level metadata. Leave them in place
          // with the original URL — the diagnostic already surfaced the
          // problem and nothing references the definition unless the
          // corresponding `linkReference`/`imageReference` exists, which
          // is also visited and stripped.
          return undefined;
        }
        return undefined;
      }
      if (result.value.kind === 'internal' || result.value.kind === 'asset') {
        linkLike.url = result.value.href;
      }
      return undefined;
    });
  };
};

function toDiagnostic(node: Link | Image, target: string): Diagnostic {
  const message = `link target "${target}" was not found in the slug map`;
  const position = node.position;
  if (position === undefined) {
    return createDiagnostic({
      severity: 'warning',
      ruleId: 'broken-link',
      message,
      source: SOURCE,
    });
  }
  return createDiagnostic({
    severity: 'warning',
    ruleId: 'broken-link',
    message,
    source: SOURCE,
    place: { line: position.start.line, column: position.start.column },
  });
}

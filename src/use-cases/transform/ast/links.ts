/**
 * AST-level link transformer (remark plugin).
 *
 * Walks `link` and `image` nodes and rewrites their `url` field using the
 * pure `rewriteInternalLink` use-case. Broken internal `.md` references are
 * reported via the supplied diagnostics array — the link itself is left
 * intact so the surrounding Markdown stays parseable.
 *
 * Plugin contract:
 *   - Owns the `(link, *)` and `(image, *)` namespace cells.
 *   - Idempotent: a link whose href is already in `/slug` form stays as
 *     `/slug` because it does not end in `.md`/`.mdx` and is classified as
 *     `asset` (preserved untouched).
 *   - Pure given the AST and the injected slug map: no I/O, no global state.
 *
 * Options:
 *   fromSourcePath  — the source file's path, used to resolve relative refs
 *   slugMap         — the run-wide slug map
 *   diagnostics     — output sink; the plugin appends Diagnostics, never throws
 */

import { visit, SKIP } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Image, Link, Root } from 'mdast';
import { rewriteInternalLink } from '../rewrite-links.js';
import type { SlugMap } from '../../../domain/starlight/slug-map.js';
import { createDiagnostic, type Diagnostic } from '../../../domain/diagnostics/diagnostic.js';

export interface LinkTransformOptions {
  readonly fromSourcePath: string;
  readonly slugMap: SlugMap;
  readonly diagnostics: Diagnostic[];
}

const SOURCE = 'mkdocs-material-to-starlight';

export const transformLinkNodes: Plugin<[LinkTransformOptions], Root> = (options) => {
  return (tree) => {
    visit(tree, ['link', 'image'], (node, index, parent) => {
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
            (parent.children as unknown[]).splice(
              index,
              1,
              ...(linkLike.children ?? []),
            );
            return [SKIP, index];
          }
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

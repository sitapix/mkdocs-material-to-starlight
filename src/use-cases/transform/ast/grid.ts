/**
 * AST-level grid transformer (remark plugin).
 *
 * Walks `containerDirective` nodes named `card-grid`, `card`, or `grid` and
 * rewrites them into a small set of CSS-class-tagged `<div>` HTML blocks. The
 * resulting Markdown is plain-`.md` compatible (no MDX required) and Starlight
 * picks up the styling via the user's `src/styles/` (a small CSS shim is
 * shipped by the converter as part of the project scaffold in a future round).
 *
 * Plugin contract:
 *   - Owns `(containerDirective, card-grid)`, `(containerDirective, card)`,
 *     and `(containerDirective, grid)`. Other directives are ignored.
 *   - Idempotent: the converted output contains `<div class="sl-card-grid">`
 *     etc. — not directives — so the second pass finds nothing to convert.
 *   - Pure given the AST: no I/O.
 */

import type { Root } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

interface ContainerDirectiveLike {
  type: 'containerDirective';
  name: string;
  attributes?: Record<string, string | null | undefined>;
  data?: { starlightConverted?: boolean };
  children: unknown[];
}

const TAG_BY_NAME: Readonly<Record<string, string>> = {
  'card-grid': 'sl-card-grid',
  card: 'sl-card',
  grid: 'sl-grid',
};

export const transformGridDirectives: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'containerDirective', (node, index, parent) => {
      const directive = node as unknown as ContainerDirectiveLike;
      const cls = TAG_BY_NAME[directive.name];
      if (cls === undefined) {
        return undefined;
      }
      if (parent === undefined || index === undefined) {
        return undefined;
      }
      const replacement = renderGridBlock(directive, cls);
      (parent.children as unknown[]).splice(index, 1, ...replacement);
      return index;
    });
  };
};

function renderGridBlock(
  directive: ContainerDirectiveLike,
  cssClass: string,
): ReadonlyArray<unknown> {
  const out: unknown[] = [{ type: 'html', value: `<div class="${cssClass}">` }];
  const label = readDirectiveLabel(directive);
  if (label !== null) {
    out.push({ type: 'html', value: `<strong>${label}</strong>` });
  }
  for (const child of directive.children) {
    if (isDirectiveLabel(child)) {
      continue;
    }
    out.push(child);
  }
  out.push({ type: 'html', value: '</div>' });
  return out;
}

interface LabelLike {
  type: string;
  data?: { directiveLabel?: boolean };
  children?: ReadonlyArray<{ type?: string; value?: string }>;
}

function readDirectiveLabel(directive: ContainerDirectiveLike): string | null {
  const first = directive.children[0] as LabelLike | undefined;
  if (first === undefined || first.data?.directiveLabel !== true) {
    return null;
  }
  const text = (first.children ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.value ?? '')
    .join('');
  return text.length > 0 ? text : null;
}

function isDirectiveLabel(child: unknown): boolean {
  return (
    typeof child === 'object' &&
    child !== null &&
    'data' in child &&
    (child as { data?: { directiveLabel?: boolean } }).data?.directiveLabel === true
  );
}

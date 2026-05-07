/**
 * AST-level admonition transformer (remark plugin).
 *
 * Walks `containerDirective` nodes whose `name` is a Material admonition
 * type and rewrites them as the matching Starlight aside (`:::note`,
 * `:::tip`, `:::caution`, `:::danger`) so output stays plain Markdown
 * instead of MDX.
 *
 * Mapping lives in `admonition-mapping.ts`. Total over the 12 Material
 * types: `quote` becomes a blockquote; the other 11 become directive
 * renames with an optional icon hint via `{icon="..."}`.
 *
 * Plugin contract:
 *   - Owns `(containerDirective, <admonition-name>)` for the 12 names.
 *   - Idempotent (`data.starlightConverted`; output names match Starlight
 *     types).
 *   - Pure given the AST. The source normalizer handles type fallbacks.
 */

import type { Blockquote, Root } from 'mdast';
import type { Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import {
  type AdmonitionType,
  parseAdmonitionType,
} from '../../../domain/syntax/admonition-type.js';
import {
  type AsideDescriptor,
  type BlockquoteDescriptor,
  type MappedAdmonition,
  mapAdmonitionToAside,
} from '../admonition-mapping.js';

interface ContainerDirectiveLike {
  type: 'containerDirective';
  name: string;
  attributes?: Record<string, string | null | undefined>;
  data?: DirectiveData;
  children: unknown[];
}

interface DirectiveData {
  starlightConverted?: boolean;
  hName?: string;
  hProperties?: Record<string, string>;
}

const STARLIGHT_NAMES: ReadonlySet<string> = new Set(['note', 'tip', 'caution', 'danger']);

export const transformAdmonitionDirectives: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'containerDirective', (node, index, parent) => {
      const directive = node as unknown as ContainerDirectiveLike;

      if (directive.data?.starlightConverted === true) {
        return SKIP;
      }

      const parsed = parseAdmonitionType(directive.name);
      if (parsed.isFallback) {
        return undefined;
      }

      const collapsible = readCollapsible(directive);
      if (collapsible !== null && parent !== undefined && index !== undefined) {
        replaceWithDetails(parent, index, directive, collapsible);
        return [SKIP, index + 1];
      }

      const mapping = mapAdmonitionToAside(parsed.type);

      if (isBlockquote(mapping)) {
        if (parent !== undefined && index !== undefined) {
          replaceWithBlockquote(parent, index, directive);
        }
        return SKIP;
      }

      applyAsideRename(directive, parsed.type, mapping);
      return SKIP;
    });
  };
};

function isBlockquote(mapping: MappedAdmonition): mapping is BlockquoteDescriptor {
  return 'renderAsBlockquote' in mapping;
}

function replaceWithBlockquote(
  parent: { children: unknown[] },
  index: number,
  directive: ContainerDirectiveLike,
): void {
  const blockquote: Blockquote = {
    type: 'blockquote',
    children: directive.children as Blockquote['children'],
  };
  parent.children[index] = blockquote;
}

type CollapsibleState = 'open' | 'closed';

function readCollapsible(directive: ContainerDirectiveLike): CollapsibleState | null {
  const value = directive.attributes?.collapsible;
  if (value === 'open') return 'open';
  if (value === 'closed') return 'closed';
  return null;
}

function readTitle(directive: ContainerDirectiveLike): string | null {
  const attr = directive.attributes?.title ?? directive.attributes?.label;
  if (typeof attr === 'string' && attr.length > 0) {
    return attr;
  }
  return readDirectiveLabel(directive);
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

function replaceWithDetails(
  parent: { children: unknown[] },
  index: number,
  directive: ContainerDirectiveLike,
  state: CollapsibleState,
): void {
  const openTag = state === 'open' ? '<details open>' : '<details>';
  const summary = readTitle(directive);
  const replacement: unknown[] = [{ type: 'html', value: openTag }];
  if (summary !== null) {
    replacement.push({ type: 'html', value: `<summary>${summary}</summary>` });
  }
  for (const child of directive.children) {
    if (isDirectiveLabelChild(child)) {
      continue;
    }
    replacement.push(child);
  }
  replacement.push({ type: 'html', value: '</details>' });
  parent.children.splice(index, 1, ...replacement);
}

function isDirectiveLabelChild(child: unknown): boolean {
  return (
    typeof child === 'object' &&
    child !== null &&
    'data' in child &&
    (child as { data?: { directiveLabel?: boolean } }).data?.directiveLabel === true
  );
}

function applyAsideRename(
  directive: ContainerDirectiveLike,
  _type: AdmonitionType,
  mapping: AsideDescriptor,
): void {
  directive.name = mapping.asideType;

  if (mapping.iconHint !== undefined) {
    const attrs = directive.attributes ?? {};
    if (attrs.icon === undefined || attrs.icon === null) {
      attrs.icon = mapping.iconHint;
    }
    directive.attributes = attrs;
  }

  const data: DirectiveData = directive.data ?? {};
  data.starlightConverted = true;
  directive.data = data;
}

void STARLIGHT_NAMES;

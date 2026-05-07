/**
 * F3 migration: <Icon> JSX must emit as mdxJsxTextElement (inline-flavored)
 * rather than a `{type:'html', value:'<Icon ... />'}` opaque text blob.
 * Companion to icons.test.ts (asserts string output) — this asserts the
 * structural AST shape so the change is robust against MDX point releases.
 */

import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from '../../../domain/diagnostics/diagnostic.js';
import { transformIcons } from './icons.js';

interface TypedNode {
  readonly type: string;
  readonly name?: string;
  readonly value?: string;
}

function runIcons(source: string): Root {
  const diagnostics: Diagnostic[] = [];
  const parsed = unified().use(remarkParse).parse(source);
  return unified().use(remarkParse).use(transformIcons, { diagnostics }).runSync(parsed) as Root;
}

function collect(tree: Root): ReadonlyArray<TypedNode> {
  const out: TypedNode[] = [];
  visit(tree, (node) => {
    out.push(node as TypedNode);
  });
  return out;
}

describe('transformIcons — structural AST emit', () => {
  it('emits Icon as mdxJsxTextElement{name:Icon}, not html{value:"<Icon ... />"}', () => {
    const tree = runIcons('Click :material-rocket: to launch.\n');
    const nodes = collect(tree);

    const hasMdxIcon = nodes.some((n) => n.type === 'mdxJsxTextElement' && n.name === 'Icon');
    const hasHtmlIcon = nodes.some(
      (n) => n.type === 'html' && typeof n.value === 'string' && /<Icon[\s/]/.test(n.value),
    );

    expect(hasMdxIcon).toBe(true);
    expect(hasHtmlIcon).toBe(false);
  });
});

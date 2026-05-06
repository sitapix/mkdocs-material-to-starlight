/**
 * F3 migration: tabs/grids/cards must emit `mdxJsxFlowElement` nodes from
 * `mdast-util-mdx-jsx` rather than opaque `{type: 'html'}` strings. This
 * file asserts the structural AST shape of the emit; the existing
 * tabs.test.ts asserts the stringified output. Both must pass — the
 * stringified output asserts byte-stability, the AST shape asserts
 * structural correctness that won't drift with future MDX point releases.
 */

import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import { transformTabDirectives } from './tabs.js';

interface TypedNode {
  readonly type: string;
  readonly name?: string;
  readonly value?: string;
}

function parse(source: string): Root {
  const tree = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(transformTabDirectives, { emitMdxTabs: true })
    .runSync(unified().use(remarkParse).use(remarkDirective).parse(source)) as Root;
  return tree;
}

function collect(tree: Root): ReadonlyArray<TypedNode> {
  const out: TypedNode[] = [];
  visit(tree, (node) => {
    out.push(node as TypedNode);
  });
  return out;
}

describe('transformTabDirectives — structural AST emit', () => {
  it('emits a mdxJsxFlowElement{name:Tabs}, not html{value:"<Tabs>"}', () => {
    const tree = parse('::::tabs\n:::tab[A]\nbody\n:::\n::::\n');
    const nodes = collect(tree);

    const hasMdxTabs = nodes.some(
      (n) => n.type === 'mdxJsxFlowElement' && n.name === 'Tabs',
    );
    const hasHtmlTabs = nodes.some(
      (n) => n.type === 'html' && typeof n.value === 'string' && /<Tabs[\s>]/.test(n.value),
    );

    expect(hasMdxTabs).toBe(true);
    expect(hasHtmlTabs).toBe(false);
  });

  it('emits each TabItem as a mdxJsxFlowElement{name:TabItem}, not html{value:"<TabItem ...>"}', () => {
    const tree = parse('::::tabs\n:::tab[A]\nbody-a\n:::\n:::tab[B]\nbody-b\n:::\n::::\n');
    const nodes = collect(tree);

    const tabItems = nodes.filter(
      (n) => n.type === 'mdxJsxFlowElement' && n.name === 'TabItem',
    );
    const htmlTabItems = nodes.filter(
      (n) => n.type === 'html' && typeof n.value === 'string' && /<TabItem/.test(n.value),
    );

    expect(tabItems).toHaveLength(2);
    expect(htmlTabItems).toHaveLength(0);
  });
});

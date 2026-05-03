/**
 * AST-level tabs transformer (remark plugin).
 *
 * Walks `containerDirective` nodes named `tabs` or `tab` and rewrites them
 * into HTML `<div>` blocks with `sl-tabs` and `sl-tab` CSS classes. The
 * resulting output is plain `.md`-compatible (no MDX required); Starlight
 * picks up the styling via the `mkdocs-migration.css` shim shipped by the
 * converter into `src/styles/`.
 *
 * The tab title (from the directive label `:::tab[Title]`) becomes a
 * `data-label` attribute on the inner div, which the CSS shim wires into
 * a tab-bar via `[data-label]::before` content.
 *
 * Plugin contract:
 *   - Owns `(containerDirective, tabs)` and `(containerDirective, tab)`.
 *   - Idempotent: output contains `<div class="sl-tabs">` etc. — not
 *     directives — so the second pass finds nothing to rewrite.
 *   - Pure given the AST: no I/O.
 */

import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root } from 'mdast';

interface ContainerDirectiveLike {
  type: 'containerDirective';
  name: string;
  attributes?: Record<string, string | null | undefined>;
  data?: { starlightConverted?: boolean };
  children: unknown[];
}

export interface TabTransformOptions {
  /**
   * When true, emit Starlight `<Tabs syncKey="…">` MDX components instead
   * of the default plain HTML `<div class="sl-tabs">` blocks. The syncKey
   * is derived from the tab label set so identically-labelled tab groups
   * stay synchronised across pages. Set when `theme.features` includes
   * `content.tabs.link` in mkdocs.yml.
   */
  readonly emitMdxTabs?: boolean;
}

export const transformTabDirectives: Plugin<[TabTransformOptions?], Root> = (
  options = {},
) => {
  const emitMdx = options.emitMdxTabs === true;
  return (tree) => {
    visit(tree, 'containerDirective', (node, index, parent) => {
      const directive = node as unknown as ContainerDirectiveLike;
      if (directive.name !== 'tabs' && directive.name !== 'tab') {
        return undefined;
      }
      if (parent === undefined || index === undefined) {
        return undefined;
      }
      const replacement =
        directive.name === 'tabs'
          ? emitMdx
            ? renderTabsContainerMdx(directive)
            : renderTabsContainer(directive)
          : emitMdx
            ? renderTabMdx(directive)
            : renderTab(directive);
      (parent.children as unknown[]).splice(index, 1, ...replacement);
      return index;
    });
  };
};

function renderTabsContainerMdx(
  directive: ContainerDirectiveLike,
): ReadonlyArray<unknown> {
  const labels = collectChildLabels(directive);
  const syncKey = deriveSyncKey(labels);
  const openTag =
    syncKey === null
      ? '<Tabs>'
      : `<Tabs syncKey="${escapeAttr(syncKey)}">`;
  const out: unknown[] = [{ type: 'html', value: openTag }];
  for (const child of directive.children) {
    if (isDirectiveLabel(child)) continue;
    out.push(child);
  }
  out.push({ type: 'html', value: '</Tabs>' });
  return out;
}

function renderTabMdx(directive: ContainerDirectiveLike): ReadonlyArray<unknown> {
  const label = readDirectiveLabel(directive);
  const openTag =
    label === null
      ? '<TabItem label="Tab">'
      : `<TabItem label="${escapeAttr(label)}">`;
  const out: unknown[] = [{ type: 'html', value: openTag }];
  for (const child of directive.children) {
    if (isDirectiveLabel(child)) continue;
    out.push(child);
  }
  out.push({ type: 'html', value: '</TabItem>' });
  return out;
}

function collectChildLabels(
  directive: ContainerDirectiveLike,
): ReadonlyArray<string> {
  const labels: string[] = [];
  for (const child of directive.children) {
    if (
      typeof child === 'object' &&
      child !== null &&
      (child as { type?: string }).type === 'containerDirective'
    ) {
      const childDir = child as unknown as ContainerDirectiveLike;
      if (childDir.name === 'tab') {
        const label = readDirectiveLabel(childDir);
        if (label !== null) labels.push(label);
      }
    }
  }
  return labels;
}

function deriveSyncKey(labels: ReadonlyArray<string>): string | null {
  if (labels.length === 0) return null;
  const sorted = [...labels].map((l) => l.toLowerCase().trim()).sort();
  return sorted.join('-').replace(/[^A-Za-z0-9_-]+/g, '_');
}

function renderTabsContainer(directive: ContainerDirectiveLike): ReadonlyArray<unknown> {
  const exclusive =
    directive.attributes?.['exclusive'] !== undefined &&
    directive.attributes['exclusive'] !== null;
  const openTag = exclusive
    ? '<div class="sl-tabs" data-exclusive="true">'
    : '<div class="sl-tabs">';
  return wrapWithDiv(directive, openTag);
}

function renderTab(directive: ContainerDirectiveLike): ReadonlyArray<unknown> {
  const label = readDirectiveLabel(directive);
  const openTag =
    label === null
      ? '<div class="sl-tab">'
      : `<div class="sl-tab" data-label="${escapeAttr(label)}">`;
  return wrapWithDiv(directive, openTag);
}

function wrapWithDiv(
  directive: ContainerDirectiveLike,
  openTag: string,
): ReadonlyArray<unknown> {
  const out: unknown[] = [{ type: 'html', value: openTag }];
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
  // Both plain text nodes and inlineCode nodes (backtick-quoted labels like
  // `pydantic<3`) contribute to the label string. Without inlineCode, a label
  // like "`pydantic<3`" produces an empty string and falls back to "Tab".
  const text = (first.children ?? [])
    .filter((c) => c.type === 'text' || c.type === 'inlineCode')
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

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

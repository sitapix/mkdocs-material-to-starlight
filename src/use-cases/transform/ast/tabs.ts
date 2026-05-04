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
import { extractLabelIcon } from '../extract-label-icon.js';

interface ContainerDirectiveLike {
  type: 'containerDirective';
  name: string;
  attributes?: Record<string, string | null | undefined>;
  data?: { starlightConverted?: boolean };
  children: unknown[];
}

export interface TabTransformOptions {
  /**
   * When true (default), emit Starlight `<Tabs>+<TabItem>` MDX components.
   * When false, emit the legacy plain HTML `<div class="sl-tabs">` blocks
   * (kept as an explicit opt-out only — the MDX path is the supported one).
   */
  readonly emitMdxTabs?: boolean;
  /**
   * When true, the emitted `<Tabs>` carries a `syncKey="…"` derived from
   * the tab label set so identically-labelled groups stay synchronised
   * across pages. Set when `theme.features` includes `content.tabs.link`
   * in mkdocs.yml. No effect when `emitMdxTabs` is false.
   */
  readonly tabsLinked?: boolean;
  /**
   * Optional shortcode → Starlight icon name override map, threaded through
   * to the icon-extraction helper used on tab labels. Mirrors the override
   * map passed to the icon transform.
   */
  readonly iconOverrides?: Readonly<Record<string, string>>;
}

export const transformTabDirectives: Plugin<[TabTransformOptions?], Root> = (
  options = {},
) => {
  const emitMdx = options.emitMdxTabs !== false;
  const tabsLinked = options.tabsLinked === true;
  const iconOverrides = options.iconOverrides;
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
            ? renderTabsContainerMdx(directive, iconOverrides, tabsLinked)
            : renderTabsContainer(directive)
          : emitMdx
            ? renderTabMdx(directive, iconOverrides)
            : renderTab(directive, iconOverrides);
      (parent.children as unknown[]).splice(index, 1, ...replacement);
      return index;
    });
  };
};

function renderTabsContainerMdx(
  directive: ContainerDirectiveLike,
  iconOverrides: Readonly<Record<string, string>> | undefined,
  tabsLinked: boolean,
): ReadonlyArray<unknown> {
  // syncKey is only emitted when the source `mkdocs.yml` opted into Material's
  // `content.tabs.link` cross-page sync feature; emitting it unconditionally
  // would impose synchronization the author didn't ask for. When set, it is
  // derived from the cleaned (icon-stripped) labels so two tab groups that
  // differ only in icon shortcodes still synchronise correctly.
  const openTag = tabsLinked
    ? buildLinkedTabsOpenTag(directive, iconOverrides)
    : '<Tabs>';
  const out: unknown[] = [{ type: 'html', value: openTag }];
  for (const child of directive.children) {
    if (isDirectiveLabel(child)) continue;
    out.push(child);
  }
  out.push({ type: 'html', value: '</Tabs>' });
  return out;
}

function buildLinkedTabsOpenTag(
  directive: ContainerDirectiveLike,
  iconOverrides: Readonly<Record<string, string>> | undefined,
): string {
  const labels = collectChildLabels(directive, iconOverrides);
  const syncKey = deriveSyncKey(labels);
  return syncKey === null
    ? '<Tabs>'
    : `<Tabs syncKey="${escapeAttr(syncKey)}">`;
}

function renderTabMdx(
  directive: ContainerDirectiveLike,
  iconOverrides: Readonly<Record<string, string>> | undefined,
): ReadonlyArray<unknown> {
  const rawLabel = readDirectiveLabel(directive);
  const openTag = rawLabel === null
    ? '<TabItem label="Tab">'
    : buildTabItemOpenTag(rawLabel, iconOverrides);
  const out: unknown[] = [{ type: 'html', value: openTag }];
  for (const child of directive.children) {
    if (isDirectiveLabel(child)) continue;
    out.push(child);
  }
  out.push({ type: 'html', value: '</TabItem>' });
  return out;
}

function buildTabItemOpenTag(
  rawLabel: string,
  iconOverrides: Readonly<Record<string, string>> | undefined,
): string {
  const { iconName, label } = extractLabelIcon(
    iconOverrides === undefined
      ? { rawLabel }
      : { rawLabel, overrides: iconOverrides },
  );
  const safeLabel = label.length > 0 ? label : 'Tab';
  if (iconName === null) {
    return `<TabItem label="${escapeAttr(safeLabel)}">`;
  }
  return `<TabItem icon="${escapeAttr(iconName)}" label="${escapeAttr(safeLabel)}">`;
}

function collectChildLabels(
  directive: ContainerDirectiveLike,
  iconOverrides: Readonly<Record<string, string>> | undefined,
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
        const raw = readDirectiveLabel(childDir);
        if (raw !== null) {
          const cleaned = extractLabelIcon(
            iconOverrides === undefined
              ? { rawLabel: raw }
              : { rawLabel: raw, overrides: iconOverrides },
          ).label;
          if (cleaned.length > 0) labels.push(cleaned);
        }
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

function renderTab(
  directive: ContainerDirectiveLike,
  iconOverrides: Readonly<Record<string, string>> | undefined,
): ReadonlyArray<unknown> {
  const rawLabel = readDirectiveLabel(directive);
  // Plain HTML tabs have no `icon` attribute slot, but we still strip the
  // shortcode so the visible data-label doesn't carry literal `:foo:` text.
  const cleaned = rawLabel === null ? null : extractLabelIcon(
    iconOverrides === undefined
      ? { rawLabel }
      : { rawLabel, overrides: iconOverrides },
  ).label;
  const openTag =
    cleaned === null || cleaned.length === 0
      ? '<div class="sl-tab">'
      : `<div class="sl-tab" data-label="${escapeAttr(cleaned)}">`;
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

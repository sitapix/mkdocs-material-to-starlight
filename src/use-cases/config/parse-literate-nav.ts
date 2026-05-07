/**
 * Pure parser for `mkdocs-literate-nav` SUMMARY.md files.
 *
 * Translates the plugin's Markdown-list nav format into the same
 * `MkdocsNavEntry[]` tree the YAML `nav:` parser produces, so the
 * compile-navigation pipeline stays unchanged.
 *
 * Shapes:
 *   * [Label](page.md)         → FileEntry
 *   * [Label](https://...)     → ExternalEntry
 *   * Label                    → SectionEntry (children from nested list)
 *     * [Child](child.md)
 *   * [Label](page.md)         → SectionEntry titled "Label"
 *     * [Child](child.md)
 *
 * Limitations (Phase 1):
 *   - Only the first top-level list in the file is consumed.
 *   - `[Section](dir/)` (which mkdocs-literate-nav recurses into
 *     `dir/SUMMARY.md`) is parsed as a plain FileEntry; recursion is a
 *     follow-up.
 *
 * Pure. Returns diagnostics for unparseable items. Never throws.
 */

import type { Link, List, ListItem, Paragraph, Root, Text } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'config/parse-literate-nav';
const EXTERNAL_RE = /^[a-z][a-z0-9+\-.]*:\/\//i;

export interface ParseLiterateNavResult {
  readonly nav: ReadonlyArray<MkdocsNavEntry>;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function parseLiterateNav(source: string): ParseLiterateNavResult {
  const ast = unified().use(remarkParse).parse(source) as Root;
  const list = findFirstList(ast);
  if (list === null) {
    return { nav: [], diagnostics: [] };
  }
  const diagnostics: Diagnostic[] = [];
  const nav = parseList(list, diagnostics);
  return { nav, diagnostics };
}

function findFirstList(root: Root): List | null {
  for (const child of root.children) {
    if (child.type === 'list') return child;
  }
  return null;
}

function parseList(list: List, diagnostics: Diagnostic[]): MkdocsNavEntry[] {
  const out: MkdocsNavEntry[] = [];
  for (const item of list.children) {
    const entry = parseListItem(item, diagnostics);
    if (entry !== null) out.push(entry);
  }
  return out;
}

function parseListItem(item: ListItem, diagnostics: Diagnostic[]): MkdocsNavEntry | null {
  const paragraph = item.children.find((c): c is Paragraph => c.type === 'paragraph');
  const nestedList = item.children.find((c): c is List => c.type === 'list');
  const link = paragraph === undefined ? undefined : firstLink(paragraph);
  const labelText =
    link !== undefined
      ? linkText(link)
      : paragraph === undefined
        ? ''
        : paragraphText(paragraph).trim();

  if (nestedList !== undefined) {
    const children = parseList(nestedList, diagnostics);
    return {
      kind: 'section',
      title: labelText || '(untitled)',
      children,
    };
  }

  if (link !== undefined) {
    if (EXTERNAL_RE.test(link.url)) {
      return { kind: 'external', title: linkText(link), href: link.url };
    }
    return { kind: 'file', title: linkText(link), path: link.url };
  }

  if (labelText.length === 0) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'plugin-literate-nav-malformed',
        source: SOURCE,
        message:
          'literate-nav list item has no link, no nested list, and no plain-text label; skipping.',
      }),
    );
    return null;
  }

  // A bare-text item with no nested list is treated as an empty section so
  // the label is still surfaced. Users can edit MIGRATION_NOTES if they
  // intended a child list and forgot to indent it.
  return { kind: 'section', title: labelText, children: [] };
}

function firstLink(paragraph: Paragraph): Link | undefined {
  for (const node of paragraph.children) {
    if (node.type === 'link') return node;
  }
  return undefined;
}

function linkText(link: Link): string {
  return link.children
    .filter((c): c is Text => c.type === 'text')
    .map((c) => c.value)
    .join('')
    .trim();
}

function paragraphText(paragraph: Paragraph): string {
  return paragraph.children
    .filter((c): c is Text => c.type === 'text')
    .map((c) => c.value)
    .join('');
}

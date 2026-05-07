/**
 * AST-level icon transformer (remark plugin).
 *
 * Splits `text` nodes on Material / FontAwesome / Octicons shortcodes
 * (`:material-rocket:`, `:fontawesome-brands-github:`, ...) and replaces
 * each with a raw-HTML mdast node holding `<Icon name="rocket" />`.
 * Starlight's built-in `Icon` renders the SVG; files with at least one
 * icon get promoted to `.mdx` and `Icon` is added to auto-imports.
 *
 * The `:icon[name]` directive form has no Starlight remark plugin, so it
 * renders as plain text. Emitting JSX directly bypasses that gap and
 * matches the intent in `domain/conversion-mapping/table.ts`.
 *
 * Unmapped icons fall through to `<Icon name="local:<set>:<name>" />` and
 * fire the `icon-unmapped` diagnostic.
 *
 * Plugin contract:
 *   - Acts on shortcode-shaped substrings only; other text is left alone.
 *   - Skips `code` and `inlineCode` nodes.
 *   - Idempotent: emitted JSX is not shortcode-shaped.
 *   - Unknown icon-set prefixes emit `icon-unmapped`.
 */

import type { PhrasingContent, Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { SKIP, visit } from 'unist-util-visit';
import { createDiagnostic, type Diagnostic } from '../../../domain/diagnostics/diagnostic.js';
import { type IconDescriptor, resolveIcon } from '../resolve-icon.js';

export interface IconTransformOptions {
  readonly diagnostics: Diagnostic[];
  readonly overrides?: Readonly<Record<string, string>>;
}

const SHORTCODE_RE = /:[a-z][a-z0-9-]*[a-z0-9]:/g;
// Match an `attr_list` blob immediately after an icon shortcode, e.g.
// `:material-info:{ title="Important" }`. Only `title="..."` is consumed
// (other attrs are out of scope for Phase 1). The blob may contain other
// attrs in any order; we extract title via a focused regex below.
const TITLE_ATTR_RE = /\btitle\s*=\s*"([^"]*)"/;
const SOURCE = 'mkdocs-material-to-starlight';

// Replaced legacy `TextDirectiveLike` shape with raw-HTML mdast nodes — see
// the file-level comment for why directives don't render in Starlight.

export const transformIcons: Plugin<[IconTransformOptions], Root> = (options) => {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (parent === undefined || index === undefined) {
        return;
      }
      // MDAST `code` and `inlineCode` carry their content in `value`, never as
      // child `text` nodes, so the visitor will never reach a text node inside
      // a fenced or inline code block. Fence-shielding is therefore structural,
      // not behavioural — verified by the "does not match inside fenced code"
      // and "inside inline code" tests.
      const replacement = splitTextNode(node, options);
      if (replacement === null) {
        return;
      }
      parent.children.splice(index, 1, ...(replacement as PhrasingContent[]));
      return [SKIP, index + replacement.length];
    });
  };
};

type SplitNode = Text | MdxJsxTextElementNode;

function splitTextNode(node: Text, options: IconTransformOptions): ReadonlyArray<SplitNode> | null {
  const value = node.value;
  const matches = [...value.matchAll(SHORTCODE_RE)];
  if (matches.length === 0) {
    return null;
  }

  const out: SplitNode[] = [];
  let cursor = 0;
  let didReplaceAny = false;

  for (const match of matches) {
    const start = match.index;
    if (start === undefined) {
      continue;
    }
    const shortcode = match[0];
    const descriptor = resolveIcon({ shortcode, ...maybeOverrides(options) });
    if (descriptor === null) {
      continue;
    }
    if (descriptor.kind === 'placeholder') {
      options.diagnostics.push(unmappedDiagnostic(descriptor));
      continue;
    }
    pushIfNonEmpty(out, value.slice(cursor, start));
    const afterShortcode = start + shortcode.length;
    const trailing = consumeTrailingAttrs(value, afterShortcode);
    out.push(toIconHtml(descriptor, trailing.label));
    cursor = trailing.consumedTo;
    didReplaceAny = true;
  }

  if (!didReplaceAny) {
    return null;
  }

  pushIfNonEmpty(out, value.slice(cursor));
  return out;
}

function maybeOverrides(options: IconTransformOptions): {
  overrides?: Readonly<Record<string, string>>;
} {
  return options.overrides === undefined ? {} : { overrides: options.overrides };
}

function pushIfNonEmpty(out: SplitNode[], value: string): void {
  if (value.length === 0) {
    return;
  }
  out.push({ type: 'text', value });
}

function toIconHtml(descriptor: IconDescriptor, label: string | null): MdxJsxTextElementNode {
  if (descriptor.kind === 'starlight-builtin') {
    return makeIconHtml(descriptor.name, label);
  }
  if (descriptor.kind === 'local-svg') {
    return makeIconHtml(`local:${descriptor.iconSet}:${descriptor.iconName}`, label);
  }
  // placeholder is handled in the caller; this branch is unreachable.
  return makeIconHtml(descriptor.original, label);
}

interface MdxJsxAttribute {
  readonly type: 'mdxJsxAttribute';
  readonly name: string;
  readonly value: string;
}

interface MdxJsxTextElementNode {
  readonly type: 'mdxJsxTextElement';
  readonly name: string;
  readonly attributes: ReadonlyArray<MdxJsxAttribute>;
  readonly children: ReadonlyArray<unknown>;
}

function makeIconHtml(name: string, label: string | null): MdxJsxTextElementNode {
  // Inline-flavored mdxJsxTextElement so the icon nests cleanly inside text
  // without breaking surrounding paragraphs. The `class="sl-inline-icon"`
  // attribute pairs with a CSS rule in `mkdocs-migration.css` (shipped via
  // customCss) that overrides Starlight's `display: block` on every <svg>
  // inside `.sl-markdown-content` — without it, phrases like "this icon ✏️
  // appears here" wrap onto multiple lines. Self-closing (no children) so
  // `detectMdxNeeds`' tag scanner counts it without needing a closer.
  const attributes: MdxJsxAttribute[] = [
    { type: 'mdxJsxAttribute', name: 'name', value: name },
    { type: 'mdxJsxAttribute', name: 'class', value: 'sl-inline-icon' },
  ];
  if (label !== null) {
    attributes.push({ type: 'mdxJsxAttribute', name: 'aria-label', value: label });
  }
  return {
    type: 'mdxJsxTextElement',
    name: 'Icon',
    attributes,
    children: [],
  };
}

interface TrailingAttrs {
  readonly label: string | null;
  readonly consumedTo: number;
}

function consumeTrailingAttrs(value: string, afterShortcode: number): TrailingAttrs {
  // Find a `{...}` blob starting at the next non-space character. The Material
  // attr_list spec allows optional whitespace between the shortcode and the
  // brace, but no other tokens (otherwise the blob is unrelated).
  let i = afterShortcode;
  while (i < value.length && value[i] === ' ') {
    i += 1;
  }
  if (value[i] !== '{') {
    return { label: null, consumedTo: afterShortcode };
  }
  // Scan to a matching `}` on the same string. Curly braces don't nest in
  // attr_list so a flat scan is sufficient.
  const closeIndex = value.indexOf('}', i + 1);
  if (closeIndex === -1) {
    return { label: null, consumedTo: afterShortcode };
  }
  const blob = value.slice(i + 1, closeIndex);
  const titleMatch = blob.match(TITLE_ATTR_RE);
  // Promote `title="..."` to a Starlight-compatible label if present.
  if (titleMatch !== null) {
    const label = titleMatch[1] ?? '';
    return { label, consumedTo: closeIndex + 1 };
  }
  // No title attr — but if the blob is pure PyMdown attr_list shape
  // (`.class`, `#id`, `key=value` tokens only), consume and discard it.
  // Otherwise the `{ .mdx-heart .mdx-insiders }` decoration would survive
  // as visible text after the icon. Real mkdocs-material regression in
  // `blog/posts/transforming-material-for-mkdocs.md`.
  if (isPureAttrList(blob)) {
    return { label: null, consumedTo: closeIndex + 1 };
  }
  return { label: null, consumedTo: afterShortcode };
}

const ATTR_TOKEN_RE = /^(?:\.[\w-]+|#[\w-]+|[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[\w-]+))$/;

function isPureAttrList(blob: string): boolean {
  const trimmed = blob.trim();
  if (trimmed.length === 0) return false;
  // Tokenize on whitespace (quoted values stay intact).
  const tokens: string[] = [];
  let j = 0;
  while (j < trimmed.length) {
    while (j < trimmed.length && /\s/.test(trimmed[j] ?? '')) j += 1;
    if (j >= trimmed.length) break;
    const start = j;
    while (j < trimmed.length && !/\s/.test(trimmed[j] ?? '')) {
      const ch = trimmed[j];
      if (ch === '"' || ch === "'") {
        const close = trimmed.indexOf(ch, j + 1);
        if (close === -1) return false;
        j = close + 1;
        continue;
      }
      j += 1;
    }
    tokens.push(trimmed.slice(start, j));
  }
  return tokens.length > 0 && tokens.every((t) => ATTR_TOKEN_RE.test(t));
}

function unmappedDiagnostic(descriptor: { original: string }): Diagnostic {
  return createDiagnostic({
    severity: 'warning',
    ruleId: 'icon-unmapped',
    message:
      `icon shortcode ":${descriptor.original}:" has no Starlight mapping; left in place. ` +
      'For a third-party Iconify set (mdi, fa6-brands, octicons, …) see ' +
      'https://hideoo.dev/notes/starlight-third-party-icon-sets',
    source: SOURCE,
  });
}

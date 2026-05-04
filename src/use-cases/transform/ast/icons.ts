/**
 * AST-level icon transformer (remark plugin).
 *
 * Walks `text` nodes and splits them on Material/FontAwesome/Octicons icon
 * shortcodes (`:material-rocket:`, `:fontawesome-brands-github:`, …). Each
 * shortcode is replaced by a `textDirective` whose `name` is `icon` and
 * whose `[label]` carries the resolved Starlight icon name.
 *
 * The output directive `:icon[rocket]` is consumed by the downstream
 * compiler (or Starlight itself in MDX mode) to render `<Icon name="rocket"/>`.
 * Unmapped icons fall through to a `local:<set>:<name>` label so the asset
 * copier can place the original SVG in `src/icons/` and the Icon component
 * picks it up via the local-icon convention.
 *
 * Plugin contract:
 *   - Owns the `(text, *)` cell *for shortcode-shaped substrings only*. Plain
 *     text is left alone.
 *   - Skips text inside `code` and `inlineCode` nodes (visit doesn't descend
 *     into their children, but we also avoid splitting on shortcode-shaped
 *     fragments inside them by virtue of their type).
 *   - Idempotent: the output is `:icon[...]` directives, which are not
 *     shortcode-shaped, so the second pass finds nothing to convert.
 *   - Diagnostic-first: unrecognized icon-set prefixes emit `icon-unmapped`
 *     but still leave the original shortcode in place.
 */

import { visit, SKIP } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { PhrasingContent, Root, Text } from 'mdast';
import { resolveIcon, type IconDescriptor } from '../resolve-icon.js';
import { createDiagnostic, type Diagnostic } from '../../../domain/diagnostics/diagnostic.js';

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

interface TextDirectiveLike {
  readonly type: 'textDirective';
  readonly name: 'icon';
  readonly attributes: Record<string, string>;
  readonly children: ReadonlyArray<{ type: 'text'; value: string }>;
}

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

type SplitNode = Text | TextDirectiveLike;

function splitTextNode(
  node: Text,
  options: IconTransformOptions,
): ReadonlyArray<SplitNode> | null {
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
    out.push(toDirective(descriptor, trailing.label));
    cursor = trailing.consumedTo;
    didReplaceAny = true;
  }

  if (!didReplaceAny) {
    return null;
  }

  pushIfNonEmpty(out, value.slice(cursor));
  return out;
}

function maybeOverrides(
  options: IconTransformOptions,
): { overrides?: Readonly<Record<string, string>> } {
  return options.overrides === undefined ? {} : { overrides: options.overrides };
}

function pushIfNonEmpty(out: SplitNode[], value: string): void {
  if (value.length === 0) {
    return;
  }
  out.push({ type: 'text', value });
}

function toDirective(
  descriptor: IconDescriptor,
  label: string | null,
): TextDirectiveLike {
  if (descriptor.kind === 'starlight-builtin') {
    return makeIconDirective(descriptor.name, label);
  }
  if (descriptor.kind === 'local-svg') {
    return makeIconDirective(
      `local:${descriptor.iconSet}:${descriptor.iconName}`,
      label,
    );
  }
  // placeholder is handled in the caller; this branch is unreachable.
  return makeIconDirective(descriptor.original, label);
}

function makeIconDirective(name: string, label: string | null): TextDirectiveLike {
  return {
    type: 'textDirective',
    name: 'icon',
    attributes: label === null ? {} : { label },
    children: [{ type: 'text', value: name }],
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
  if (titleMatch === null) {
    return { label: null, consumedTo: afterShortcode };
  }
  const label = titleMatch[1] ?? '';
  return { label, consumedTo: closeIndex + 1 };
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

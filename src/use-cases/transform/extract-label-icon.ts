/**
 * Pull a Material/FontAwesome/Octicon icon shortcode out of a directive
 * label string so it can be promoted to a Starlight `icon="..."` JSX prop.
 *
 * Container directives like `:::tab[:fontawesome-brands-python: Python]`
 * stringify into JSX as `<TabItem label=":fontawesome-brands-python:
 * Python">` — the literal shortcode is visible to readers because the icon
 * transform only walks `text` mdast nodes, never JSX attribute strings. By
 * extracting the icon at label-build time we route mapped icons through the
 * structured `icon` prop and strip unmapped ones from the visible label.
 *
 * Pure value transformation: rawLabel → { iconName, label }. Resolves
 * exactly one shortcode (the first one found); subsequent shortcodes are
 * left in the label since most directive labels carry only a single icon
 * by convention. Skips shortcodes that don't resolve to anything (passes
 * the original label through unchanged).
 */

import { resolveIcon, type IconDescriptor } from './resolve-icon.js';

const SHORTCODE_RE = /:[a-z][a-z0-9-]*[a-z0-9]:/;

export interface LabelIcon {
  /** Starlight built-in icon name (e.g. "seti:python") or null if unresolved/unmappable. */
  readonly iconName: string | null;
  /** Label text with the consumed shortcode (and surrounding whitespace) removed. */
  readonly label: string;
}

export interface ExtractLabelIconInput {
  readonly rawLabel: string;
  readonly overrides?: Readonly<Record<string, string>>;
}

export function extractLabelIcon(input: ExtractLabelIconInput): LabelIcon {
  const match = input.rawLabel.match(SHORTCODE_RE);
  if (match === null || match.index === undefined) {
    return { iconName: null, label: input.rawLabel };
  }

  const shortcode = match[0];
  const descriptor = resolveIconForLabel(shortcode, input.overrides);
  if (descriptor === null) {
    return { iconName: null, label: input.rawLabel };
  }

  // Cut out the shortcode AND collapse the now-redundant whitespace around it
  // so `:icon: Python` → `Python` rather than `  Python` or `Python `.
  const before = input.rawLabel.slice(0, match.index);
  const after = input.rawLabel.slice(match.index + shortcode.length);
  const cleaned = `${before.replace(/\s+$/, '')} ${after.replace(/^\s+/, '')}`.trim();

  if (descriptor.kind === 'starlight-builtin') {
    return { iconName: descriptor.name, label: cleaned };
  }
  // local-svg / placeholder: we can't put a local SVG in Starlight's `icon`
  // prop without per-project Iconify setup, so just strip the shortcode and
  // leave a clean label.
  return { iconName: null, label: cleaned };
}

function resolveIconForLabel(
  shortcode: string,
  overrides: Readonly<Record<string, string>> | undefined,
): IconDescriptor | null {
  return overrides === undefined
    ? resolveIcon({ shortcode })
    : resolveIcon({ shortcode, overrides });
}

/**
 * Pull a Material / FontAwesome / Octicon icon shortcode out of a directive
 * label string so it can be promoted to a Starlight `icon="..."` JSX prop.
 *
 * `:::tab[:fontawesome-brands-python: Python]` stringifies as
 * `<TabItem label=":fontawesome-brands-python: Python">`. The icon transform
 * only walks text mdast nodes, never JSX attribute strings, so the literal
 * shortcode would render visibly. Extracting at label-build time routes
 * mapped icons through the structured `icon` prop.
 *
 * Pure: rawLabel → { iconName, label }. The first shortcode becomes the
 * prop; later shortcodes in the label are stripped (JSX attribute strings
 * can't embed components). mkdocs-material tab labels like
 * `:material-link: blog/2024/01/31/:material-dots-horizontal:/` regressed
 * with the trailing shortcode visible.
 */

import { type IconDescriptor, resolveIcon } from './resolve-icon.js';

const SHORTCODE_RE = /:[a-z][a-z0-9-]*[a-z0-9]:/;
const SHORTCODE_RE_GLOBAL = /:[a-z][a-z0-9-]*[a-z0-9]:/g;

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
  const firstStripped = `${before.replace(/\s+$/, '')} ${after.replace(/^\s+/, '')}`.trim();
  // Strip any remaining shortcodes from the label too. JSX attribute strings
  // can't embed JSX, so a literal `:material-foo:` left behind would render
  // as visible text rather than an icon — drop it.
  const cleaned = stripRemainingShortcodes(firstStripped);

  if (descriptor.kind === 'starlight-builtin') {
    return { iconName: descriptor.name, label: cleaned };
  }
  // local-svg / placeholder: we can't put a local SVG in Starlight's `icon`
  // prop without per-project Iconify setup, so just strip the shortcode and
  // leave a clean label.
  return { iconName: null, label: cleaned };
}

function stripRemainingShortcodes(label: string): string {
  return label
    .replace(SHORTCODE_RE_GLOBAL, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function resolveIconForLabel(
  shortcode: string,
  overrides: Readonly<Record<string, string>> | undefined,
): IconDescriptor | null {
  return overrides === undefined
    ? resolveIcon({ shortcode })
    : resolveIcon({ shortcode, overrides });
}

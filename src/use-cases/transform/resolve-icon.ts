/**
 * Resolve a Material for MkDocs icon shortcode (`:material-rocket:`,
 * `:fontawesome-brands-github:`, `:octicons-repo-push-16:`) to a Starlight
 * Icon descriptor.
 *
 * The resolver implements a four-step fallback chain:
 *
 *   1. user override map           → starlight-builtin with custom name
 *   2. curated Material → builtin  → starlight-builtin with mapped name
 *   3. recognized icon-set prefix  → local-svg (caller copies the SVG asset)
 *   4. unrecognized prefix         → placeholder (caller emits a diagnostic)
 *
 * Pure: takes the shortcode and the override table, returns a typed
 * descriptor. The caller (a remark plugin walking text and inline-code
 * nodes) is responsible for turning the descriptor into JSX or HTML.
 */

import { CURATED_ICON_MAP, ICON_SET_PREFIXES } from './icon-mappings.js';

export type IconDescriptor =
  | { readonly kind: 'starlight-builtin'; readonly name: string; readonly original: string }
  | {
      readonly kind: 'local-svg';
      readonly iconSet: string;
      readonly iconName: string;
      readonly original: string;
    }
  | { readonly kind: 'placeholder'; readonly original: string };

export interface ResolveIconInput {
  readonly shortcode: string;
  readonly overrides?: Readonly<Record<string, string>>;
}

const SHORTCODE_PATTERN = /^:([a-z][a-z0-9-]*[a-z0-9]):$/;

export function resolveIcon(input: ResolveIconInput): IconDescriptor | null {
  const stripped = stripShortcode(input.shortcode);
  if (stripped === null) {
    return null;
  }

  const overrideName = input.overrides?.[stripped];
  if (overrideName !== undefined) {
    return { kind: 'starlight-builtin', name: overrideName, original: stripped };
  }

  const builtin = CURATED_ICON_MAP[stripped];
  if (builtin !== undefined) {
    return { kind: 'starlight-builtin', name: builtin, original: stripped };
  }

  const iconSet = detectIconSet(stripped);
  if (iconSet !== null) {
    const iconName = stripped.slice(iconSet.length + 1);
    return { kind: 'local-svg', iconSet, iconName, original: stripped };
  }

  // A bare `:identifier:` (no hyphen) is not icon-shaped — Material/FontAwesome/
  // Octicons all use `prefix-name` form. Treat it as a non-match so other
  // markdown extensions' tokens (mkautodoc's `:docstring:`/`:members:`, emoji
  // shortcodes, etc.) are left alone instead of being claimed as unmapped icons.
  if (!stripped.includes('-')) {
    return null;
  }

  return { kind: 'placeholder', original: stripped };
}

function stripShortcode(shortcode: string): string | null {
  const match = shortcode.match(SHORTCODE_PATTERN);
  if (match === null) {
    return null;
  }
  return match[1] ?? null;
}

function detectIconSet(name: string): string | null {
  for (const prefix of ICON_SET_PREFIXES) {
    if (name === prefix) {
      return null;
    }
    if (name.startsWith(`${prefix}-`)) {
      return prefix;
    }
  }
  return null;
}

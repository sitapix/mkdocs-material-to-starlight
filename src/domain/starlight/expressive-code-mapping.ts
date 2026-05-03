/**
 * Translate `pymdownx.highlight` options into a Starlight `expressiveCode`
 * theme pair plus a list of options the converter cannot honor.
 *
 * Material renders code blocks with Pygments at MkDocs build time, parameterized
 * by `markdown_extensions: pymdownx.highlight`. Starlight uses ExpressiveCode
 * (Shiki under the hood) at Astro build time. The two highlighters share TextMate
 * grammars but ship different theme catalogs, so this mapping selects the
 * closest Shiki theme pair for each named Pygments style.
 *
 * The pair is returned as `[light, dark]` so the caller can pass it directly to
 * `expressiveCode: { themes: [...] }`. Both halves are required for Starlight's
 * theme switcher to work correctly.
 *
 * Pure data + a small lookup function. No I/O. The caller (config-detection
 * layer in the interface shell) reads `mkdocs.yml`, calls this function, and
 * uses the result to populate `serializeAstroConfig`'s `expressiveCode` input.
 */

export interface ExpressiveCodeMapping {
  /** [light, dark] Shiki theme identifiers, both required by Starlight. */
  readonly themes: readonly [string, string];
  /** The original `pygments_style:` value, for diagnostics. */
  readonly sourceStyle: string;
  /** True when `sourceStyle` had no curated mapping and a default pair was used. */
  readonly fellBack: boolean;
  /** `pymdownx.highlight` keys that ExpressiveCode does not honor. */
  readonly unsupportedOptions: readonly string[];
}

const DEFAULT_PAIR: readonly [string, string] = ['github-light', 'github-dark'];

const PYGMENTS_TO_SHIKI: ReadonlyMap<string, readonly [string, string]> = new Map(
  Object.entries({
    default: ['github-light', 'github-dark'],
    monokai: ['github-light', 'monokai'],
    dracula: ['github-light', 'dracula'],
    nord: ['github-light', 'nord'],
    'solarized-dark': ['solarized-light', 'solarized-dark'],
    'solarized-light': ['solarized-light', 'solarized-dark'],
    'one-dark': ['github-light', 'one-dark-pro'],
    'one-light': ['one-light', 'one-dark-pro'],
    'github-dark': ['github-light', 'github-dark'],
    'github-light': ['github-light', 'github-dark'],
    material: ['material-theme-lighter', 'material-theme-darker'],
    'material-darker': ['material-theme-lighter', 'material-theme-darker'],
    'material-lighter': ['material-theme-lighter', 'material-theme-darker'],
    'material-ocean': ['material-theme-lighter', 'material-theme-ocean'],
    'material-palenight': ['material-theme-lighter', 'material-theme-palenight'],
    friendly: ['light-plus', 'dark-plus'],
    vs: ['light-plus', 'dark-plus'],
    'vs-dark': ['light-plus', 'dark-plus'],
    native: ['github-light', 'vitesse-dark'],
    'gruvbox-dark': ['gruvbox-light-medium', 'gruvbox-dark-medium'],
    'gruvbox-light': ['gruvbox-light-medium', 'gruvbox-dark-medium'],
    'rose-pine': ['rose-pine-dawn', 'rose-pine'],
    'rose-pine-moon': ['rose-pine-dawn', 'rose-pine-moon'],
    'rose-pine-dawn': ['rose-pine-dawn', 'rose-pine'],
    'tokyo-night': ['github-light', 'tokyo-night'],
    'night-owl': ['github-light', 'night-owl'],
    'catppuccin-latte': ['catppuccin-latte', 'catppuccin-mocha'],
    'catppuccin-mocha': ['catppuccin-latte', 'catppuccin-mocha'],
    'catppuccin-frappe': ['catppuccin-latte', 'catppuccin-frappe'],
    'catppuccin-macchiato': ['catppuccin-latte', 'catppuccin-macchiato'],
  }) as ReadonlyArray<[string, readonly [string, string]]>,
);

/** Options whose ExpressiveCode default already matches the Material default,
 *  so listing them as "unsupported" would be misleading. */
const NOOP_OPTIONS = new Set<string>(['auto_title']);

/** Options that have no equivalent ExpressiveCode surface and are dropped. */
const UNSUPPORTED_KEYS: ReadonlyArray<string> = [
  'linenums',
  'linenums_style',
  'linenums_special',
  'anchor_linenums',
  'line_spans',
  'line_anchors',
  'noclasses',
  'use_pygments',
  'extend_pygments_lang',
  'pygments_lang_class',
];

export function mapPygmentsHighlightToExpressiveCode(
  raw: unknown,
): ExpressiveCodeMapping | null {
  const options = extractHighlightOptions(raw);
  if (options === null) return null;

  const styleValue = options.pygments_style;
  if (typeof styleValue !== 'string') return null;
  const sourceStyle = styleValue.toLowerCase();

  const curated = PYGMENTS_TO_SHIKI.get(sourceStyle);
  const themes = curated ?? DEFAULT_PAIR;
  const fellBack = curated === undefined;

  const unsupportedOptions = UNSUPPORTED_KEYS.filter(
    (key) => key in options && !NOOP_OPTIONS.has(key),
  );

  return {
    themes,
    sourceStyle,
    fellBack,
    unsupportedOptions,
  };
}

function extractHighlightOptions(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const found = extractHighlightOptions(entry);
      if (found !== null) return found;
    }
    return null;
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const direct = obj['pymdownx.highlight'];
    if (direct !== undefined && direct !== null && typeof direct === 'object') {
      return direct as Record<string, unknown>;
    }
    if ('pygments_style' in obj || 'linenums' in obj) {
      return obj;
    }
  }

  return null;
}

/**
 * Translate Material for MkDocs palette colors into a Starlight-compatible
 * accent definition.
 *
 * Material exposes 21 named primary colors (red, pink, purple, deep purple,
 * indigo, blue, light blue, cyan, teal, green, light green, lime, yellow,
 * amber, orange, deep orange, brown, grey, blue grey, black, white) plus
 * `custom` (which uses --md-primary-fg-color from the user's stylesheet).
 *
 * Starlight's theming surface is a hue+chroma pair on the accent ramp, plus
 * neutral grays. Rather than perfectly reproduce Material's color choices
 * (impossible: Material's hues use Material Design 2014 palettes), we map
 * each named color to its closest equivalent in Starlight's accent space.
 *
 * Pure data + a single lookup function. No I/O, no behaviour beyond the
 * mapping. Returns null when the palette is missing or names a color the
 * mapping does not recognize. The `isCustom` flag is set when the user
 * specified `primary: custom` so callers can emit a diagnostic.
 */

export interface StarlightPalette {
  /** OKLCH hue (degrees). Used for --sl-color-accent-* derivations. */
  readonly accentHue: number;
  /** OKLCH chroma. 0.15 = saturated, 0 = grayscale. */
  readonly accentChroma: number;
  /** True when the user wrote `primary: custom`; caller emits diagnostic. */
  readonly isCustom: boolean;
  /** Original Material color name for diagnostic context. */
  readonly sourceName: string;
  /** OKLCH hue derived from a paired `scheme: slate` entry, when the palette
   *  is an array with both a default and a slate variant. Used to override
   *  the accent ramp inside `[data-theme='dark']`. */
  readonly darkAccentHue?: number;
  /** OKLCH chroma for the slate-scheme variant, paired with `darkAccentHue`. */
  readonly darkAccentChroma?: number;
  /** Original Material color name for the slate variant, for diagnostics. */
  readonly darkSourceName?: string;
}

const HUE_TABLE: ReadonlyMap<string, { hue: number; chroma: number }> = new Map(
  Object.entries({
    red: { hue: 25, chroma: 0.2 },
    pink: { hue: 350, chroma: 0.18 },
    purple: { hue: 305, chroma: 0.18 },
    'deep purple': { hue: 285, chroma: 0.2 },
    indigo: { hue: 270, chroma: 0.18 },
    blue: { hue: 250, chroma: 0.18 },
    'light blue': { hue: 230, chroma: 0.16 },
    cyan: { hue: 210, chroma: 0.14 },
    teal: { hue: 195, chroma: 0.14 },
    green: { hue: 145, chroma: 0.16 },
    'light green': { hue: 130, chroma: 0.16 },
    lime: { hue: 115, chroma: 0.18 },
    yellow: { hue: 95, chroma: 0.18 },
    amber: { hue: 75, chroma: 0.18 },
    orange: { hue: 55, chroma: 0.18 },
    'deep orange': { hue: 40, chroma: 0.18 },
    brown: { hue: 50, chroma: 0.06 },
    grey: { hue: 270, chroma: 0.01 },
    'blue grey': { hue: 250, chroma: 0.03 },
    black: { hue: 0, chroma: 0 },
    white: { hue: 0, chroma: 0 },
  }),
);

export function mapMaterialPaletteToStarlight(
  raw: unknown,
): StarlightPalette | null {
  const primary = extractPrimary(raw);
  if (primary === null) return null;
  if (primary === 'custom') {
    return { accentHue: 0, accentChroma: 0, isCustom: true, sourceName: 'custom' };
  }
  const entry = HUE_TABLE.get(primary);
  if (entry === undefined) return null;

  const slate = extractSlatePrimary(raw);
  const slateEntry = slate === null ? undefined : HUE_TABLE.get(slate);

  return {
    accentHue: entry.hue,
    accentChroma: entry.chroma,
    isCustom: false,
    sourceName: primary,
    ...(slateEntry === undefined || slate === null
      ? {}
      : {
          darkAccentHue: slateEntry.hue,
          darkAccentChroma: slateEntry.chroma,
          darkSourceName: slate,
        }),
  };
}

function extractPrimary(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const found = extractPrimary(entry);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const direct = obj.primary;
    if (typeof direct === 'string') return direct.toLowerCase();
  }
  return null;
}

/** Find a `scheme: slate` entry in a palette array and return its `primary`
 *  color name. Returns null when the palette is not an array, has no slate
 *  entry, or the slate entry has no `primary` value. */
function extractSlatePrimary(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    if (obj.scheme !== 'slate') continue;
    const primary = obj.primary;
    if (typeof primary === 'string') return primary.toLowerCase();
  }
  return null;
}

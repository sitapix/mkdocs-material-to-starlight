/**
 * Translate Material's `theme.font.{text,code}` (Google Font family names)
 * into Fontsource npm package identifiers + the CSS family string used to
 * override Starlight's `--sl-font` and `--sl-font-mono` custom properties.
 *
 * Fontsource (https://fontsource.org) self-hosts every Google Font as an npm
 * package whose name is the family-name lowercased with spaces replaced by
 * hyphens — so `Roboto Mono` → `@fontsource/roboto-mono`. Vite resolves the
 * package's CSS export when it is listed in starlight's `customCss` array, so
 * adding the package to `package.json` and the import to `customCss` is all
 * the user has to do. The `serializeStyleSheet` shim still emits the
 * `--sl-font` overrides so the family actually takes effect.
 *
 * Pure: takes a parsed `theme.font` value, returns the converter shape (or
 * null when nothing maps). Family names with non-ASCII characters or symbols
 * Fontsource cannot accept are rejected — the caller emits a fallback
 * diagnostic so the user knows to install the font manually.
 */

export interface MaterialFontConfig {
  /** Text font (`theme.font.text`) — drives `--sl-font`. */
  readonly text?: { readonly family: string; readonly package: string };
  /** Monospace font (`theme.font.code`) — drives `--sl-font-mono`. */
  readonly code?: { readonly family: string; readonly package: string };
}

export function mapMaterialFontsToFontsource(
  raw: unknown,
): MaterialFontConfig | null {
  // `theme.font: false` disables Google Fonts entirely — nothing to map.
  if (raw === false) return null;
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;
  const text = mapOne(obj.text);
  const code = mapOne(obj.code);
  if (text === null && code === null) return null;
  return {
    ...(text === null ? {} : { text }),
    ...(code === null ? {} : { code }),
  };
}

function mapOne(
  rawFamily: unknown,
): { family: string; package: string } | null {
  if (typeof rawFamily !== 'string') return null;
  const family = rawFamily.replace(/\s+/g, ' ').trim();
  if (family.length === 0) return null;
  // Fontsource package names accept ASCII letters, digits, hyphens — derived
  // by lowercasing the family and replacing spaces with hyphens. Anything
  // outside that alphabet means the family is not on Fontsource (CJK
  // glyphs, ligatures, decorative names with punctuation).
  if (!/^[A-Za-z0-9 ]+$/.test(family)) return null;
  // Strip common weight/style suffixes that Material users sometimes write
  // into the font family name (`Inter Regular`, `Roboto Mono Bold`). The
  // matching Fontsource package always sits at the bare family name; weights
  // are exposed as CSS variants under the same package, not separate packages.
  // Without this, families like `Inter Regular` resolve to a 404 package name.
  const WEIGHT_STYLE_TOKENS = new Set([
    'regular', 'bold', 'italic', 'medium', 'semibold', 'extrabold',
    'black', 'thin', 'extralight', 'light',
  ]);
  const tokens = family.split(' ');
  const trimmed = (() => {
    const out = [...tokens];
    while (out.length > 1) {
      const last = out[out.length - 1]?.toLowerCase() ?? '';
      if (!WEIGHT_STYLE_TOKENS.has(last)) break;
      out.pop();
    }
    return out;
  })();
  const slug = trimmed.join(' ').toLowerCase().replace(/ /g, '-');
  return { family: trimmed.join(' '), package: `@fontsource/${slug}` };
}

/**
 * Translate Material `plugins.social.cards_layout_options` into an
 * `astro-og-canvas` `getImageOptions` literal.
 *
 * Pure: takes the raw `cards_layout_options` dict, returns a JS source
 * string. Empty input returns `'{}'` (interpolated by `og-endpoint.ts`).
 *
 * Mapping (Material → astro-og-canvas):
 *   background_color → bgGradient: [<color>]
 *   background_image → bgImage: { path: ['<path>'] }
 *   color            → color (foreground)
 *   font_family      → font: { title: { families: [...] }, description: ... }
 *   logo             → logo: { path: ['<path>'] }
 *
 * astro-og-canvas takes RGB arrays in the strictest API; 0.11+ accepts hex
 * via `bgGradient`. Title/description content comes from the endpoint's
 * per-page loop, not here.
 *
 * Schema: https://github.com/delucis/astro-og-canvas#options
 */

export function translateOgCanvasOptions(options: Readonly<Record<string, unknown>>): string {
  const parts: string[] = [];

  if (typeof options.background_color === 'string') {
    parts.push(`bgGradient: [${quote(options.background_color)}]`);
  }
  if (typeof options.background_image === 'string') {
    parts.push(`bgImage: { path: [${quote(options.background_image)}] }`);
  }
  if (typeof options.color === 'string') {
    parts.push(`color: ${quote(options.color)}`);
  }
  if (typeof options.font_family === 'string') {
    const fam = quote(options.font_family);
    parts.push(`font: { title: { families: [${fam}] }, description: { families: [${fam}] } }`);
  }
  if (typeof options.logo === 'string') {
    parts.push(`logo: { path: [${quote(options.logo)}] }`);
  }

  if (parts.length === 0) return '{}';
  return `{ ${parts.join(', ')} }`;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

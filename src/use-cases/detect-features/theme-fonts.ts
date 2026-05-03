/**
 * Adapter that pulls `theme.font` out of the parsed theme options and runs
 * it through the Material → Fontsource mapping.
 *
 * Pure: takes the typed `theme.options` record, returns the converter shape
 * or undefined when nothing maps. The interface shell threads the result
 * into `serializePackageJson` (deps), `serializeAstroConfig` (customCss
 * imports), and `serializeStyleSheet` (CSS variable overrides).
 */

import {
  mapMaterialFontsToFontsource,
  type MaterialFontConfig,
} from '../../domain/starlight/font-mapping.js';

export function extractThemeFonts(
  themeOptions: Readonly<Record<string, unknown>>,
): MaterialFontConfig | undefined {
  return mapMaterialFontsToFontsource(themeOptions['font']) ?? undefined;
}

/**
 * Build the diagnostic stream describing how `theme.palette.primary` was
 * (or wasn't) translated to Starlight's accent CSS variables. Pure.
 *
 * Three cases:
 *   - palette resolved to a known Material color → info: "translated to
 *     Starlight accent CSS variables".
 *   - palette is `custom` → warning: user must hand-port their
 *     `--md-primary-fg-color` overrides.
 *   - palette is specified but unrecognized → warning: dropped, default
 *     accent used.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { StarlightPalette } from '../../domain/starlight/palette-mapping.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export function diagnosePalette(
  palette: StarlightPalette | null,
  paletteSpecified: boolean,
): ReadonlyArray<TaggedDiagnostic> {
  if (palette !== null && !palette.isCustom) {
    return [
      {
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'info',
          ruleId: 'palette-translated',
          source: SOURCE,
          message:
            `Material palette primary "${palette.sourceName}" translated to Starlight accent CSS variables (hue=${String(palette.accentHue)}).`,
        }),
      },
    ];
  }
  if (palette !== null && palette.isCustom) {
    return [
      {
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'palette-custom-needs-manual',
          source: SOURCE,
          message:
            'theme.palette.primary: custom — translate your --md-primary-fg-color overrides to --sl-color-accent-* manually.',
        }),
      },
    ];
  }
  if (paletteSpecified) {
    return [
      {
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'palette-unknown-color',
          source: SOURCE,
          message:
            'theme.palette.primary names a color the converter does not recognize; using Starlight default accent.',
        }),
      },
    ];
  }
  return [];
}

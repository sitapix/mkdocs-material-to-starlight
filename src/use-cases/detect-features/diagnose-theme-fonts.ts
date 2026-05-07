/**
 * Build a diagnostic acknowledging that `theme.font` was mapped to
 * Fontsource packages, listing the resolved package names. Pure.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export interface ThemeFontsResult {
  readonly text?: { readonly package: string };
  readonly code?: { readonly package: string };
}

export function diagnoseThemeFonts(
  themeFonts: ThemeFontsResult | undefined,
): ReadonlyArray<TaggedDiagnostic> {
  if (themeFonts === undefined) return [];
  const parts: string[] = [];
  if (themeFonts.text) parts.push(`text=${themeFonts.text.package}`);
  if (themeFonts.code) parts.push(`code=${themeFonts.code.package}`);
  return [
    {
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'theme-fonts-applied',
        source: SOURCE,
        message: `theme.font mapped to Fontsource: ${parts.join(', ')}. Run \`npm install\` to fetch.`,
      }),
    },
  ];
}

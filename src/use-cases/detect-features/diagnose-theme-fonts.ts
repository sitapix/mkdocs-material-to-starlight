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
        message: `theme.font mapped to Fontsource: ${parts.join(', ')}. Run \`npm install\` to fetch. Starlight defaults to sans-serif fonts available on a user's local device for all text, so the Fontsource package is an opt-in upgrade. To revert to the default, delete the \`@fontsource-variable/*\` import from \`src/styles/custom.css\` and drop the package from \`package.json\`. To use a different font, edit \`src/styles/custom.css\` directly or apply another Astro styling technique. See https://starlight.astro.build/guides/css-and-tailwind/#fonts.`,
      }),
    },
  ];
}

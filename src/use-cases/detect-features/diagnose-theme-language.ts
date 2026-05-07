/**
 * Build a diagnostic acknowledging that `theme.language` was mapped to
 * Starlight's `locales.root.lang`. Pure. Used only when the project has
 * no `mkdocs-static-i18n` plugin and no `extra.alternate[]` block (those
 * paths take precedence over the theme.language fallback).
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export interface ThemeLanguage {
  readonly code: string;
  readonly label: string;
}

export function diagnoseThemeLanguage(
  themeLanguage: ThemeLanguage | undefined,
): ReadonlyArray<TaggedDiagnostic> {
  if (themeLanguage === undefined) return [];
  return [
    {
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'theme-language-applied',
        source: SOURCE,
        message: `theme.language "${themeLanguage.code}" mapped to starlight locales.root.lang ("${themeLanguage.label}").`,
      }),
    },
  ];
}

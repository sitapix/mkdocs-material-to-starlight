/**
 * Build diagnostics describing how `pymdownx.highlight`'s pygments_style
 * was mapped to ExpressiveCode's `themes` array, including the curated-
 * fallback warning and any dropped unsupported options. Pure.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { extractExpressiveCodeConfig } from './expressive-code-config.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

type ExpressiveCodeConfig = NonNullable<ReturnType<typeof extractExpressiveCodeConfig>>;

export function diagnoseExpressiveCode(
  config: ExpressiveCodeConfig | undefined,
): ReadonlyArray<TaggedDiagnostic> {
  if (config === undefined) return [];
  const out: TaggedDiagnostic[] = [];
  const [light, dark] = config.themes;
  if (config.fellBack) {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'expressive-code-theme-fallback',
        source: SOURCE,
        message: `pygments_style "${config.sourceStyle}" has no curated Shiki equivalent — defaulted to ['${light}', '${dark}']. Replace expressiveCode.themes in astro.config.mjs with a closer match from https://shiki.style/themes.`,
      }),
    });
  } else {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'expressive-code-theme-applied',
        source: SOURCE,
        message: `pygments_style "${config.sourceStyle}" mapped to expressiveCode.themes ['${light}', '${dark}'].`,
      }),
    });
  }
  if (config.unsupportedOptions.length > 0) {
    out.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'expressive-code-options-dropped',
        source: SOURCE,
        message: `pymdownx.highlight option(s) dropped (no ExpressiveCode equivalent): ${config.unsupportedOptions.join(', ')}.`,
      }),
    });
  }
  return out;
}

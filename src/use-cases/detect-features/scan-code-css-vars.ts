/**
 * Scan user-authored extra CSS for Material code-block customization that
 * does not survive the move from Pygments to ExpressiveCode.
 *
 * Material exposes two layers of code-block theming through CSS:
 *
 *   1. Token-class selectors (`.highlight .sb`, `.highlight .nf`, etc.) —
 *      driven by Pygments class output. ExpressiveCode renders via Shiki and
 *      uses `<span style="color:#hex">` inline styles, so these selectors no
 *      longer match anything in the rendered HTML.
 *
 *   2. CSS variables (`--md-code-hl-string-color`, `--md-code-fg-color`,
 *      `--md-code-bg-color`, `--md-code-hl-color`, etc.) — read by Material's
 *      stylesheet but unknown to Starlight/ExpressiveCode. They are dropped.
 *
 * The user authored these in `extra_css` files; the converter copies the
 * files through unchanged (they may also contain valid CSS unrelated to
 * code blocks). This scanner inspects the file content, lists which
 * customizations were detected, and emits one diagnostic per file so the
 * user knows their tweaks need to migrate to a custom Shiki theme.
 *
 * Pure: takes (path, content) pairs, returns Diagnostic[]. No I/O.
 */

import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'detect-features/scan-code-css-vars';

/** Material code-block CSS variables. */
const MD_CODE_VAR_RE = /--md-code-(?:hl-[a-z]+-color|fg-color|bg-color|hl-color)\b/g;

/** Pygments token class selectors under `.highlight` or `.codehilite`. */
const PYGMENTS_TOKEN_RE = /\.(?:highlight|codehilite)\s+\.[a-z]{1,3}\b/g;

export interface CssScanResult {
  readonly sourcePath: string;
  readonly diagnostic: ReturnType<typeof createDiagnostic>;
}

export function scanMaterialCodeCssVars(
  files: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<CssScanResult> {
  const out: CssScanResult[] = [];
  for (const [sourcePath, content] of files) {
    const vars = unique(content.match(MD_CODE_VAR_RE) ?? []);
    const tokens = unique(content.match(PYGMENTS_TOKEN_RE) ?? []);
    if (vars.length === 0 && tokens.length === 0) continue;
    const parts: string[] = [];
    if (vars.length > 0) {
      parts.push(`CSS variables: ${vars.join(', ')}`);
    }
    if (tokens.length > 0) {
      parts.push(`Pygments token selectors: ${tokens.slice(0, 8).join(', ')}${tokens.length > 8 ? ', …' : ''}`);
    }
    out.push({
      sourcePath,
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'extra-css-code-customization-dropped',
        source: SOURCE,
        message:
          `Custom CSS at "${sourcePath}" customizes Material's Pygments-based code-block rendering (${parts.join('; ')}). ExpressiveCode (Starlight's code renderer) uses Shiki inline-style colors, not Pygments classes or Material CSS variables, so these rules will have no effect on code blocks. To recolor syntax tokens, author a custom Shiki theme JSON and pass it to \`expressiveCode: { themes: [...] }\` in astro.config.mjs. To recolor the code-block frame (background, foreground), use ExpressiveCode's styleOverrides option.`,
      }),
    });
  }
  return out;
}

function unique<T>(values: ReadonlyArray<T>): ReadonlyArray<T> {
  return Array.from(new Set(values));
}

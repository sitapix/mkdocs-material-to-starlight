/**
 * Scan user-authored extra CSS for Material code-block customizations that
 * don't survive the move from Pygments to ExpressiveCode.
 *
 * Two layers of theming:
 *   1. Token-class selectors (`.highlight .sb`, `.highlight .nf`, ...) —
 *      driven by Pygments class output. ExpressiveCode renders via Shiki
 *      with inline `<span style="color:#hex">` styles, so these selectors
 *      stop matching anything.
 *   2. CSS variables (`--md-code-hl-string-color`, `--md-code-fg-color`,
 *      `--md-code-bg-color`, ...) — read by Material's stylesheet but
 *      unknown to Starlight/ExpressiveCode. Dropped.
 *
 * `extra_css` files copy through verbatim (they may also hold unrelated
 * CSS); this scanner emits one diagnostic per file so users know to
 * migrate tweaks to a custom Shiki theme. Pure.
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

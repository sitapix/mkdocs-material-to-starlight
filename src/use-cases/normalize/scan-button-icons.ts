/**
 * Scanner: detect Material `.md-button` links whose label contains an icon
 * shortcode that does NOT resolve to a Starlight built-in. The button
 * normalizer (`normalizeButtons`) silently strips such shortcodes from the
 * label and emits a `<LinkButton>` without an `icon=` prop, so the visible
 * button text is clean — but the iconographic intent is lost.
 *
 * Surfaces one info diagnostic per file (not per occurrence) listing every
 * unmapped shortcode found in a button label, so users can either:
 *   (a) extend the converter's icon-mappings table via the `iconOverrides`
 *       option, mapping the shortcode to the closest Starlight built-in;
 *   (b) accept the loss for icons whose visual is decorative; or
 *   (c) write a custom Iconify setup if they need pixel-faithful icons.
 *
 * Pure read (no text mutation). Fence-shielded so `.md-button` patterns
 * inside fenced code are ignored. Buttons whose label contains a *resolved*
 * Starlight icon (curated map hit) are silent — only the lossy stripping
 * is flagged.
 */

import { resolveIcon } from '../transform/resolve-icon.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const FENCE = /^ {0,3}(```|~~~)/;
const BUTTON_LINE_RE =
  /\[(?<label>[^\]\n]+)\]\([^)\n]+\)\{ *\.md-button(?: +\.md-button--[a-z0-9-]+)* *\}/g;
const SHORTCODE_RE = /:([a-z][a-z0-9-]*[a-z0-9]):/g;

export function scanButtonIcons(source: string): ReadonlyArray<Diagnostic> {
  const lines = source.split('\n');
  const stripped: string[] = [];
  const seen = new Set<string>();
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.matchAll(BUTTON_LINE_RE)) {
      const label = match.groups?.['label'] ?? '';
      for (const iconMatch of label.matchAll(SHORTCODE_RE)) {
        const shortcode = `:${iconMatch[1]}:`;
        const descriptor = resolveIcon({ shortcode });
        if (descriptor === null) continue;
        if (descriptor.kind === 'starlight-builtin') continue;
        const name = (iconMatch[1] ?? '');
        if (!seen.has(name)) {
          seen.add(name);
          stripped.push(name);
        }
      }
    }
  }

  if (stripped.length === 0) return [];
  const list = stripped.map((s) => `\`:${s}:\``).join(', ');
  return [
    createDiagnostic({
      severity: 'info',
      ruleId: 'button-icon-stripped',
      source: 'normalize/scan-button-icons',
      message:
        `One or more icon shortcodes inside Material \`.md-button\` link labels were stripped because they have no curated Starlight built-in equivalent: ${list}. The buttons render with clean text but no icon glyph. To restore icons: (1) pass an \`iconOverrides\` map to the converter mapping each shortcode to a Starlight icon name; (2) edit the emitted \`<LinkButton>\` to use \`<Icon name="…" slot="icon" />\` with a custom Iconify setup; or (3) accept the loss if the icon was decorative.`,
    }),
  ];
}

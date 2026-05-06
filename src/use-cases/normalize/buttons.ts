/**
 * Pre-parse normalizer for Material's `.md-button` link decoration:
 *
 *   [Subscribe](https://example.com){ .md-button }
 *   [Subscribe](https://example.com){ .md-button .md-button--primary }
 *
 * Emits Starlight's `<LinkButton>` so the theme handles dark mode, focus
 * rings, and accent variants. The file gets promoted to `.mdx` by
 * `detectMdxNeeds` (PascalCase JSX tag).
 *
 * Variants:
 *   .md-button                       → variant="secondary"
 *   .md-button .md-button--primary   → variant="primary"
 *
 * Icon shortcodes inside the link text are extracted by `extractLabelIcon`:
 * resolvable ones move to the `icon=` prop; unresolved ones are stripped
 * so users don't see a literal `:foo:`.
 *
 * Idempotent (output has no `.md-button` markers) and fence-shielded.
 */

import { extractLabelIcon } from '../transform/extract-label-icon.js';
import { isFenceLine } from '../../domain/syntax/fence.js';
const BUTTON_RE =
  /\[(?<label>[^\]\n]+)\]\((?<url>[^)\n]+)\)\{ *(?<classes>\.md-button(?: +\.md-button--[a-z0-9-]+)*) *\}/g;

export function normalizeButtons(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (isFenceLine(line)) {
      output.push(line);
      inFence = !inFence;
      continue;
    }
    output.push(inFence ? line : rewriteLine(line));
  }
  return output.join('\n');
}

function rewriteLine(line: string): string {
  return line.replace(BUTTON_RE, (_match, ..._args) => {
    const groups = _args[_args.length - 1] as {
      label: string;
      url: string;
      classes: string;
    };
    const variant = groups.classes.includes('.md-button--primary')
      ? 'primary'
      : 'secondary';
    const { iconName, label } = extractLabelIcon({ rawLabel: groups.label });
    const iconAttr = iconName === null ? '' : ` icon="${escapeAttr(iconName)}"`;
    return `<LinkButton href="${escapeAttr(groups.url)}" variant="${variant}"${iconAttr}>${label}</LinkButton>`;
  });
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;');
}

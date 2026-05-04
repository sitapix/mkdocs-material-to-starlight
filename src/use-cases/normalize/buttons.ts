/**
 * Pre-parse normalizer for Material's `.md-button` link decoration:
 *
 *   [Subscribe](https://example.com){ .md-button }
 *   [Subscribe](https://example.com){ .md-button .md-button--primary }
 *
 * Material uses `attr_list` to attach a CSS class to the link. Starlight ships
 * `<LinkButton>` (`@astrojs/starlight/components`) which renders the same UI
 * affordance natively; emitting it here lets Starlight's theme handle dark
 * mode, focus rings, accessibility, and Liquid-Glass-style accent variants
 * for free. The file is automatically promoted to `.mdx` by the downstream
 * `detectMdxNeeds` step (PascalCase JSX tag → mdx).
 *
 * Variant mapping mirrors Material's two documented variants:
 *   - `.md-button`                          → `variant="secondary"` (subtle CTA)
 *   - `.md-button .md-button--primary`      → `variant="primary"`   (accent CTA)
 *
 * Icon shortcodes inside the link text (`[Send :fontawesome-solid-paper-plane:](#)`)
 * are extracted via `extractLabelIcon`. Resolvable shortcodes are promoted
 * to the `icon=` JSX prop; unresolved ones are stripped from the visible
 * label so the user doesn't see a literal `:foo:` artifact.
 *
 * Idempotency: `<LinkButton …>` output contains no `.md-button` source markers,
 * so `normalize(normalize(x)) === normalize(x)`.
 *
 * Fenced-code safety: lines inside triple-backtick fences are passed through
 * verbatim so a button example inside a code block is not rewritten.
 */

import { extractLabelIcon } from '../transform/extract-label-icon.js';

const FENCE = /^ {0,3}(```|~~~)/;
const BUTTON_RE =
  /\[(?<label>[^\]\n]+)\]\((?<url>[^)\n]+)\)\{ *(?<classes>\.md-button(?: +\.md-button--[a-z0-9-]+)*) *\}/g;

export function normalizeButtons(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
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

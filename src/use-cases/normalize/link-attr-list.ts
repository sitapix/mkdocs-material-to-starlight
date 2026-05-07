/**
 * Pre-parse normalizer: strip `attr_list` blobs following inline links.
 *
 *   [text](url){.internal-link target=_blank}
 *   [text](url){target="_blank" rel="noopener"}
 *
 * Starlight's MDX renderer has no equivalent. Without stripping, the brace
 * blob renders as literal text because remark treats `{` as content.
 *
 * Strips any `{...}` immediately following `](url)` or `][ref]` (no space
 * between). Each occurrence emits one info `link-attr-list-stripped`
 * diagnostic so users can re-add attributes manually on an MDX `<a>`.
 *
 * Scope: link-trailing attribute lists only. Heading, image, and block
 * attribute lists live in their own normalizers. Idempotent.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { isFenceLine } from '../../domain/syntax/fence.js';

// Matches a link followed by an optional space and a {attrs} block. The link
// itself is matched broadly (up to the closing `)` or `]`). Group 1 = the
// full link, group 2 = the attr list body (inside the braces).
const LINK_ATTR_RE = /(\[[^\]]+\]\([^)]+\)|\[[^\]]+\]\[[^\]]*\]) *\{([^}]+)\}/g;
// Material button classes are handled by normalizeButtons (which runs inside
// convertFile AFTER this normalizer). Skip any attr-list that is purely
// md-button classes so normalizeButtons can still process them.
const MD_BUTTON_ONLY_RE = /^(?:\.md-button(?:--[a-z0-9-]+)?\s*)+$/;

export interface NormalizeLinkAttrResult {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export function normalizeLinkAttrLists(source: string): NormalizeLinkAttrResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const diagnostics: Diagnostic[] = [];
  let inFence = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    if (isFenceLine(line)) {
      out.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    let transformed = '';
    let lastIndex = 0;
    let hadMatch = false;
    for (const match of line.matchAll(LINK_ATTR_RE)) {
      const attrBody = match[2] ?? '';
      // Skip Material button classes ONLY when the link is inline
      // (`[label](url)`) — `normalizeButtons` handles those by emitting a
      // `<LinkButton>` component. Reference-style links (`[label][ref]`)
      // can't be handed to `normalizeButtons` (it has no inline URL to
      // wire into the component), so we MUST strip the `{ .md-button }`
      // here or it survives as visible literal text in the output.
      const linkText = match[1] ?? '';
      const isReferenceStyle = !linkText.endsWith(')');
      if (!isReferenceStyle && MD_BUTTON_ONLY_RE.test(attrBody.trim())) {
        continue;
      }
      hadMatch = true;
      const start = match.index ?? 0;
      transformed += line.slice(lastIndex, start);
      transformed += linkText;
      lastIndex = start + match[0].length;
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'link-attr-list-stripped',
          source: 'normalize/link-attr-list',
          message: `Link attribute list {${attrBody.trim()}} was stripped at line ${String(lineNumber)}. Add desired attributes as MDX <a> props if needed.`,
          place: { line: lineNumber, column: start + linkText.length + 1 },
        }),
      );
    }
    if (hadMatch) {
      transformed += line.slice(lastIndex);
      out.push(transformed);
    } else {
      out.push(line);
    }
  }

  return { text: out.join('\n'), diagnostics };
}

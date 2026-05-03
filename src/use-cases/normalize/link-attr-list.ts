/**
 * Pre-parse normalizer: strip Markdown attr_list syntax following inline links.
 *
 * Material for MkDocs and Python-Markdown's `attr_list` extension allow
 * attaching HTML attributes to inline links:
 *
 *   [text](url){.internal-link target=_blank}
 *   [text](url){target="_blank" rel="noopener"}
 *
 * Starlight's MDX renderer has no equivalent syntax. Without stripping, the
 * literal `{.internal-link target=_blank}` text appears in the rendered page
 * because remark sees `{` as text content.
 *
 * This normalizer strips any `{...}` attribute list that immediately follows
 * a `](url)` or `][ref]` inline link (no whitespace between the link and the
 * brace). One info-severity `link-attr-list-stripped` diagnostic is emitted
 * per occurrence so users can add desired attributes (e.g. target="_blank")
 * manually to an MDX <a> element.
 *
 * Scope: only link-trailing attribute lists are handled. Attribute lists on
 * headings, images, or block elements are handled by separate normalizers.
 *
 * Idempotency: stripped output contains `](url)` without a trailing `{`, so
 * a second pass finds nothing to rewrite.
 */

import {
  createDiagnostic,
  type Diagnostic,
} from '../../domain/diagnostics/diagnostic.js';

const FENCE = /^ {0,3}(```|~~~)/;
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

export function normalizeLinkAttrLists(
  source: string,
): NormalizeLinkAttrResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const diagnostics: Diagnostic[] = [];
  let inFence = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    if (FENCE.test(line)) {
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
      // Skip Material button classes — normalizeButtons handles them inside
      // the convertFile pipeline (which runs after this normalizer).
      if (MD_BUTTON_ONLY_RE.test(attrBody.trim())) {
        continue;
      }
      hadMatch = true;
      const start = match.index ?? 0;
      transformed += line.slice(lastIndex, start);
      const linkText = match[1] ?? '';
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

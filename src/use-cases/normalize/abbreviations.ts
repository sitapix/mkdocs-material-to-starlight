/**
 * Pre-parse normalizer for Python-Markdown's `abbr` extension.
 *
 *   *[HTML]: Hyper Text Markup Language
 *   *[CSS]: Cascading Style Sheets
 *
 * Python-Markdown collects each `*[TERM]: definition` line, drops the
 * definitions from the output, and wraps later case-sensitive whole-word
 * occurrences in `<abbr title="...">`.
 *
 * `remark-abbr` is pinned to the pre-micromark-3 zmarkdown chain, so this
 * rewrites to inline `<abbr title="...">TERM</abbr>` HTML.
 *
 * Idempotent (output has no `*[TERM]:` markers; the whole-word boundary
 * skips already-wrapped terms). Fence-shielded and backtick-shielded.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const DEFINITION = /^ {0,3}\*\[(?<term>[^\]\n]+)\]:[ \t]+(?<title>.+?)[ \t]*$/;

export function normalizeAbbreviations(source: string): string {
  const lines = source.split('\n');
  const definitions = new Map<string, string>();
  const kept: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (isFenceLine(line)) {
      kept.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      kept.push(line);
      continue;
    }
    const match = line.match(DEFINITION);
    if (match !== null && match.groups !== undefined) {
      const term = match.groups.term ?? '';
      const title = match.groups.title ?? '';
      if (term.length > 0 && !definitions.has(term)) {
        definitions.set(term, title);
      }
      continue;
    }
    kept.push(line);
  }

  if (definitions.size === 0) {
    return source;
  }

  return rewriteOccurrences(kept, definitions);
}

function rewriteOccurrences(
  lines: ReadonlyArray<string>,
  definitions: ReadonlyMap<string, string>,
): string {
  const sortedTerms = [...definitions.keys()].sort((a, b) => b.length - a.length);
  const output: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (isFenceLine(line)) {
      output.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    output.push(rewriteLine(line, sortedTerms, definitions));
  }

  return output.join('\n');
}

function rewriteLine(
  line: string,
  sortedTerms: ReadonlyArray<string>,
  definitions: ReadonlyMap<string, string>,
): string {
  if (sortedTerms.length === 0) return line;
  // Single combined pass, longest-first alternation. A per-term sequential
  // pass would let the second term match text *inside* the first term's
  // freshly-injected `<abbr title="…">` attribute value — producing nested
  // `<abbr>` tags inside an attribute, which MDX rejects (real-world:
  // DaoCloud_DaoCloud-docs/dce/index.md, where `*[DCE]:` defines a title
  // containing the literal `AI` and `*[AI]:` defines a title containing
  // `DCE 5.0`).
  const escaped = sortedTerms.map((t) => escapeRegex(t)).join('|');
  const pattern = new RegExp(`(?<![A-Za-z0-9_])(?:${escaped})(?![A-Za-z0-9_])`, 'g');
  return line.replace(pattern, (match) => {
    const title = definitions.get(match) ?? '';
    return `<abbr title="${title}">${match}</abbr>`;
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pre-parse normalizer for Python-Markdown's `abbr` extension.
 *
 *   *[HTML]: Hyper Text Markup Language
 *   *[CSS]: Cascading Style Sheets
 *
 *   The HTML specification is maintained by the W3C.
 *
 * Material/Python-Markdown collects every `*[TERM]: definition` line, removes
 * the definitions from the rendered output, and wraps every later occurrence
 * of `TERM` (case-sensitive whole-word match) with `<abbr title="definition">`.
 *
 * No maintained remark plugin handles this — `remark-abbr` is locked to the
 * pre-micromark-3 zmarkdown chain (see library_audit_20260501.md). We rewrite
 * to inline `<abbr title="...">TERM</abbr>` HTML so the output works in plain
 * `.md`.
 *
 * Idempotency: HTML output contains no `*[TERM]:` definition markers, and
 * `<abbr>` wrappers around an already-wrapped TERM would not match the
 * whole-word boundary, so a second pass is a no-op.
 *
 * Fenced-code safety: lines inside ` ``` ` are passed through verbatim.
 * Backtick-shielded inline code is also untouched, mirroring `inline-marks`.
 */

const FENCE = /^ {0,3}(```|~~~)/;
const DEFINITION = /^ {0,3}\*\[(?<term>[^\]\n]+)\]:[ \t]+(?<title>.+?)[ \t]*$/;

export function normalizeAbbreviations(source: string): string {
  const lines = source.split('\n');
  const definitions = new Map<string, string>();
  const kept: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) {
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
      const term = match.groups['term'] ?? '';
      const title = match.groups['title'] ?? '';
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
    if (FENCE.test(line)) {
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
  let out = line;
  for (const term of sortedTerms) {
    const title = definitions.get(term) ?? '';
    const escaped = escapeRegex(term);
    const pattern = new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, 'g');
    out = out.replace(pattern, `<abbr title="${title}">${term}</abbr>`);
  }
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

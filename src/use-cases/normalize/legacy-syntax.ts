/**
 * Pre-parse normalizer for legacy syntax carried over from Sphinx / AsciiDoc
 * and inline-HTML anchor patterns. Runs for `.md` and `.mdx`.
 *
 * Three fence-shielded transforms:
 *
 *   1. `<span id="…"> Title` heading-anchor stripping. Starlight derives
 *      anchors from heading text; the wrapper pollutes HTML and (in MDX)
 *      breaks parsing when the closer is missing. Stripped from the start
 *      of headings, list items, and paragraphs. Stacked spans are all
 *      stripped.
 *
 *   2. AsciiDoc cross-reference `<<page#anchor, label>>` rewriting to
 *      standard Markdown links: `<<anchor, label>>` becomes
 *      `[label](#anchor)`; `<<page.md#anchor, label>>` becomes
 *      `[label](page.md#anchor)`; `<<anchor>>` becomes `[anchor](#anchor)`.
 *
 *   3. AsciiDoc inline-anchor `[[id]]` stripping from heading lines and
 *      prose. TOML array-of-tables inside fences is preserved; reference-
 *      style links `[text][label]` (separated by `][`) pass through.
 *
 * Idempotent and pure: output contains no `<<…>>` or `[[anchor]]` markers.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const PREFIX_RE = /^(\\?#{1,6}\s+|[-*+]\s+|\d+\.\s+)?/;
const SPAN_OPEN_WITH_ATTRS_RE = /^<span\b([^>]*)>\s*/;
// Match `</span>` at end-of-line OR mid-line. Real-world
// (jujimeizuo/note/cs/others/regex.md): a list item like
// `- <span style="…">(?<=pattern)</span>：匹配前面…` has its closer
// mid-line. End-of-line-only matching leaves an orphan `</span>` after
// the opener strip — MDX then errors with "Unexpected closing slash".
const SPAN_CLOSE_ANY_RE = /\s*<\/span>\s*/;
const ID_ATTR_RE = /\bid\s*=\s*"([^"]+)"|\bid\s*=\s*'([^']+)'/;

/**
 * Optional collector for `normalizeLegacySyntax`. Captures destructive
 * rewrites so the calling use-case can emit user-facing diagnostics — silent
 * strips of attribute lists and heading anchors lose information users need.
 */
export interface LegacySyntaxReport {
  spanAnchorsStripped: Array<{ line: number; anchorId: string }>;
  bareAttrLines: Array<{ line: number; content: string }>;
}

// `<<page.md#anchor, label>>` or `<<anchor, label>>` or `<<anchor>>`.
//   group 1: target (page#anchor or anchor)
//   group 2 (optional): comma + label
const ASCIIDOC_XREF_RE = /<<([^,>\s][^,>]*?)(?:,\s*([^>]+?))?>>/g;
// `[[anchor-id]]` not preceded by `]` (excludes `]\[]` link variants) and
// not followed by `(` (asciidoc-style link is rare in MkDocs output but
// Markdown footnotes `[^id]` and reference-style `[text][label]` are
// distinct shapes — we match only the strict `[[ident]]` form here).
const ASCIIDOC_ANCHOR_RE = /\[\[([A-Za-z][A-Za-z0-9_.-]*)\]\]/g;

const BARE_ATTR_LIST_LINE = /^\s*\{([^{}\n]+)\}\s*$/;
const ATTR_LIST_SHAPE = /(?:^|\s)\.[A-Za-z_][\w-]*|[A-Za-z_][\w-]*\s*=/;

export function normalizeLegacySyntax(source: string, report?: LegacySyntaxReport): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx] ?? '';
    if (isFenceLine(line)) {
      output.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    // Drop bare standalone-line PyMdown attr_list (`{ .card }`, `{ .annotate
    // style="..." }`). These decorate the previous block in PyMdown but
    // Starlight has no equivalent post-MDX hook, AND in MDX they fail acorn.
    // STANDALONE-line only — multiline math `\frac{a}{b}` and inline JSX
    // `{user.name}` are unaffected because they're not whole-line `{...}`.
    // Pure `{#id}` lines are preserved so heading-anchor escape can rewrite
    // them visibly.
    const attrLineMatch = line.match(BARE_ATTR_LIST_LINE);
    if (attrLineMatch !== null && ATTR_LIST_SHAPE.test(attrLineMatch[1] ?? '')) {
      report?.bareAttrLines.push({ line: idx + 1, content: line.trim() });
      continue;
    }
    output.push(rewriteLine(line, idx + 1, report));
  }
  return output.join('\n');
}

function rewriteLine(line: string, lineNumber: number, report?: LegacySyntaxReport): string {
  let out = stripSpanAnchorAtStart(line, lineNumber, report);
  out = out.replace(ASCIIDOC_XREF_RE, (_match, target, label) => {
    const targetStr = (target ?? '').trim();
    const labelStr = ((label as string | undefined) ?? targetStr).trim();
    const href = targetStr.includes('#')
      ? targetStr.startsWith('http')
        ? targetStr
        : targetStr
      : `#${targetStr}`;
    return `[${labelStr}](${href})`;
  });
  out = out.replace(ASCIIDOC_ANCHOR_RE, '');
  return out;
}

function stripSpanAnchorAtStart(
  line: string,
  lineNumber: number,
  report?: LegacySyntaxReport,
): string {
  const prefixMatch = line.match(PREFIX_RE);
  const prefix = prefixMatch?.[0] ?? '';
  let body = line.slice(prefix.length);
  if (!body.startsWith('<span')) return line;
  let stripped = false;
  let openMatch = body.match(SPAN_OPEN_WITH_ATTRS_RE);
  while (openMatch !== null) {
    if (report !== undefined) {
      const attrs = openMatch[1] ?? '';
      const idMatch = attrs.match(ID_ATTR_RE);
      const anchorId = idMatch?.[1] ?? idMatch?.[2] ?? '';
      if (anchorId.length > 0) {
        report.spanAnchorsStripped.push({ line: lineNumber, anchorId });
      }
    }
    body = body.slice(openMatch[0].length);
    stripped = true;
    openMatch = body.match(SPAN_OPEN_WITH_ATTRS_RE);
  }
  if (!stripped) return line;
  // Strip ONE `</span>` per opener removed — keeps the count balanced and
  // doesn't touch closers that belong to spans we left alone.
  body = body.replace(SPAN_CLOSE_ANY_RE, ' ').trimEnd();
  return prefix + body;
}

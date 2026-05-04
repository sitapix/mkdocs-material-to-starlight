/**
 * Pre-parse normalizer: strip and rewrite legacy syntax that Material/MkDocs
 * sites carry over from prior generators (Sphinx, AsciiDoc) and inline-HTML
 * anchor patterns. Runs for ALL converted files (`.md` and `.mdx`), unlike
 * the MDX-only sanitizer.
 *
 * Three transforms, all fence-shielded:
 *
 *   1. **`<span id="…"> Title` heading-anchor stripping.** Material lets users
 *      attach an explicit anchor to a heading or list item by wrapping the
 *      content in `<span id="…">`. Starlight derives anchors from heading
 *      text automatically; the wrapper pollutes the rendered HTML and (in
 *      MDX) causes parse errors when the closing tag is missing. Stripped
 *      anywhere it appears at the start of a heading / list item /
 *      paragraph; consecutive stacked spans are all stripped.
 *
 *   2. **AsciiDoc cross-reference `<<page#anchor, label>>` rewriting.**
 *      AsciiDoc sites often migrate to MkDocs without updating cross-refs,
 *      leaving raw `<<…>>` text in the output. Converted to standard
 *      Markdown links: `<<anchor, label>>` → `[label](#anchor)`,
 *      `<<page.md#anchor, label>>` → `[label](page.md#anchor)`,
 *      `<<anchor>>` → `[anchor](#anchor)`.
 *
 *   3. **AsciiDoc inline-anchor `[[id]]` stripping.** Anchor tags that
 *      AsciiDoc rendered as invisible scroll targets render as literal
 *      `[[id]]` text in MkDocs/Markdown — visible noise. Stripped from
 *      heading lines and prose. TOML array-of-tables `[[…]]` inside code
 *      fences is preserved (fence-shielded) and Markdown reference-style
 *      links `[text][label]` are not touched (the inner brackets are
 *      separated by `]` and `[`, not `[[`).
 *
 * Idempotent (output contains no `<<…>>` or `[[anchor]]` markers and any
 * `<span>` openers in the prefix slots have been stripped, so a second
 * pass is a no-op). Pure: text → text, no I/O.
 */

const FENCE = /^ {0,3}(```|~~~)/;

const PREFIX_RE = /^(\\?#{1,6}\s+|[-*+]\s+|\d+\.\s+)?/;
const SPAN_OPEN_RE = /^<span\b[^>]*>\s*/;
const SPAN_CLOSE_TAIL_RE = /\s*<\/span>\s*$/;

// `<<page.md#anchor, label>>` or `<<anchor, label>>` or `<<anchor>>`.
//   group 1: target (page#anchor or anchor)
//   group 2 (optional): comma + label
const ASCIIDOC_XREF_RE = /<<([^,>\s][^,>]*?)(?:,\s*([^>]+?))?>>/g;
// `[[anchor-id]]` not preceded by `]` (excludes `]\[]` link variants) and
// not followed by `(` (asciidoc-style link is rare in MkDocs output but
// Markdown footnotes `[^id]` and reference-style `[text][label]` are
// distinct shapes — we match only the strict `[[ident]]` form here).
const ASCIIDOC_ANCHOR_RE = /\[\[([A-Za-z][A-Za-z0-9_.-]*)\]\]/g;

export function normalizeLegacySyntax(source: string): string {
  const lines = source.split('\n');
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
    output.push(rewriteLine(line));
  }
  return output.join('\n');
}

function rewriteLine(line: string): string {
  let out = stripSpanAnchorAtStart(line);
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

function stripSpanAnchorAtStart(line: string): string {
  const prefixMatch = line.match(PREFIX_RE);
  const prefix = prefixMatch?.[0] ?? '';
  let body = line.slice(prefix.length);
  if (!body.startsWith('<span')) return line;
  let stripped = false;
  while (SPAN_OPEN_RE.test(body)) {
    body = body.replace(SPAN_OPEN_RE, '');
    stripped = true;
  }
  if (!stripped) return line;
  body = body.replace(SPAN_CLOSE_TAIL_RE, '').trim();
  return prefix + body;
}

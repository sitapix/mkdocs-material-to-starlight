/**
 * Translate Material-form fenced code-block attributes into the meta string
 * Expressive Code (Starlight's code highlighter) accepts.
 *
 * Material syntax (after the language id, on the fence opening line):
 *   ```python linenums="2" hl_lines="3 5-7" title="example.py"
 *   ```python { .python .copy }
 *
 * Expressive Code syntax:
 *   ```python {3,5-7} showLineNumbers startLineNumber=2 title="example.py"
 *
 * Pure: text → text. Idempotent (second pass detects already-translated form
 * via presence of Expressive Code keywords).
 */

// Match a backtick-fenced opener and capture everything to end-of-line.
// CommonMark §4.5 forbids backticks INSIDE a backtick-fence info string,
// but real-world Material sources routinely break this rule by embedding
// inline-code in attr_list titles (`title="something with \`ics\`"`).
// We capture those lines anyway so we can strip the offending backticks
// before they reach the parser — leaving the line unrecognised would
// stringify the opener as escaped text and break the entire block.
const FENCE_RE = /^([ \t]*```+)([^\n]*?)$/gm;

const LINENUMS_RE = /\blinenums="(\d+)"/;
const HL_LINES_RE = /\bhl_lines="([^"]+)"/;
const ATTR_LIST_RE = /\{\s*([^}]*)\s*\}/;

// Match a `title="..."` or `title='...'` attribute anywhere in a brace block.
// Captures the quoted value in groups 1 (double) or 2 (single).
const BRACE_TITLE_RE = /\btitle=(?:"([^"]*)"|'([^']*)')/;

// A brace block is a "valid Expressive Code line-range" when its contents are
// numeric ranges only (e.g. `1,3-5`). Anything else (`upgrade="skip"`,
// `title="…"`, `linenums="2"`) is Material syntax that Expressive Code cannot
// parse and we must rewrite.
const NUMERIC_RANGE_RE = /^[\s,0-9-]+$/;

export function normalizeCodeBlockMeta(source: string): string {
  return source.replace(FENCE_RE, (full, fence: string, rest: string) => {
    const translated = translateRest(rest);
    if (translated === rest) return full;
    return `${fence}${translated}`;
  });
}

// Option keywords that can appear at the start of fence metadata without a
// language token. If the first whitespace-delimited token starts with one of
// these, it is an option — not a language identifier.
const OPTION_PREFIX_RE = /^(hl_lines|linenums|title|highlight)=/i;

function translateRest(rest: string): string {
  // Pre-process: if the meta contains a Material-form brace block (anything
  // that isn't a pure numeric line-range), extract `title="..."` if present
  // and strip the rest of the brace block. Expressive Code cannot parse
  // arbitrary key="value" pairs inside braces — it expects line ranges only.
  const rewritten = rewriteMaterialBraceBlock(rest);
  if (rewritten !== null) {
    rest = rewritten;
  }

  if (rest.includes('showLineNumbers') || rest.includes('{')) {
    // Already translated or already an EC marker — preserve.
    if (!LINENUMS_RE.test(rest) && !HL_LINES_RE.test(rest)) return rest;
  }
  const parts: string[] = [];
  let working = rest.trimStart();

  // Capture language id (first whitespace-delimited token), but only when the
  // token is not itself an option keyword (e.g. hl_lines="3 4" with no lang).
  const langMatch = working.match(/^[A-Za-z0-9_+\-#.]+/);
  const langCandidate = langMatch === null ? '' : langMatch[0];
  // A token that includes `=` or starts with a known option prefix is not a
  // language id — treat it as part of the options that follow.
  const isOption =
    langCandidate.length === 0 || langCandidate.includes('=') || OPTION_PREFIX_RE.test(working);
  const lang = isOption ? '' : langCandidate;
  if (lang.length > 0) {
    parts.push(lang);
    working = working.slice(lang.length).trimStart();
  }

  // Translate hl_lines first so the {…} form sits adjacent to the language.
  const hl = working.match(HL_LINES_RE);
  if (hl !== null) {
    const ranges = hl[1] ?? '';
    const ec = ranges.trim().split(/\s+/).join(',');
    parts.push(`{${ec}}`);
    working = working.replace(HL_LINES_RE, '').trim();
  }

  // linenums="N" → showLineNumbers + startLineNumber=N
  const linenums = working.match(LINENUMS_RE);
  if (linenums !== null) {
    const start = linenums[1] ?? '1';
    parts.push('showLineNumbers');
    if (start !== '1') {
      parts.push(`startLineNumber=${start}`);
    }
    working = working.replace(LINENUMS_RE, '').trim();
  }

  // Strip Material attr-list { .python .copy } if it duplicates language /
  // adds copy/select/annotate (handled by EC defaults).
  const attrList = working.match(ATTR_LIST_RE);
  if (attrList !== null) {
    working = working.replace(ATTR_LIST_RE, '').trim();
  }

  // Anything else (title="...", custom attrs) survives verbatim.
  if (working.length > 0) parts.push(working);

  if (parts.length === 0) return rest;
  // Reattach without leading space when language is the first token (matches
  // ```python style); add a space when there's no language but there is meta.
  if (lang.length > 0) return parts.join(' ');
  return ` ${parts.join(' ')}`.trimEnd();
}

/**
 * If `rest` contains a Material-form brace block (one whose contents are NOT
 * a pure numeric line-range), extract any `title="..."` attribute and strip
 * the entire brace block. Returns the rewritten string, or null when no
 * rewrite is needed.
 *
 * Examples:
 *   `python {upgrade="skip" title="X"}` → `python title="X"`
 *   `python {test="skip" lint="skip"}`  → `python` (everything stripped)
 *   `python {1,3-5}`                    → null (legitimate EC line-range)
 *   `python {3,5-7} title="x"`          → null (numeric brace; no rewrite)
 */
function rewriteMaterialBraceBlock(rest: string): string | null {
  const braceMatch = rest.match(ATTR_LIST_RE);
  if (braceMatch === null) return null;
  const inner = braceMatch[1] ?? '';
  if (NUMERIC_RANGE_RE.test(inner)) return null;
  const titleMatch = inner.match(BRACE_TITLE_RE);
  const rawTitle = titleMatch === null ? null : (titleMatch[1] ?? titleMatch[2] ?? '');
  // CommonMark §4.5: a backtick fence's info string may NOT contain
  // backticks. If we leave a `\`code\`` inline in the title, remark-parse
  // refuses to treat the line as a fence opener — the entire block then
  // round-trips as escaped-text-plus-stranded-fences, breaking the page.
  // Real-world: pyodide-mkdocs-theme `python_libs.md` line 395 writes
  //   ```python { title="Code d'un IDE attendant que `ics` soit installé" }
  // The author wants the rendered title to read with `ics` highlighted,
  // but the PyMdown attr_list block is the wrong place to embed that
  // markup. Strip the fence-killing backticks (they would render as
  // literal text in Expressive Code's title regardless).
  const titleValue = rawTitle === null ? null : rawTitle.replace(/`/g, '');
  // Strip the entire brace block — its non-title contents are Material-only
  // attributes (test=, lint=, upgrade=, etc.) that Expressive Code does not
  // recognize. The title, if any, is reattached outside the braces.
  let out = rest.replace(ATTR_LIST_RE, '').replace(/\s+/g, ' ').trim();
  if (titleValue !== null && titleValue.length > 0 && !out.includes('title=')) {
    out = out.length > 0 ? `${out} title="${titleValue}"` : `title="${titleValue}"`;
  }
  // Reattach a leading space so the fence-line shape (`​```python …`) is preserved.
  return out.length > 0 ? ` ${out}` : '';
}

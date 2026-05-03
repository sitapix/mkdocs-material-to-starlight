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

const FENCE_RE = /^([ \t]*```+)([^\n`]*?)$/gm;

const LINENUMS_RE = /\blinenums="(\d+)"/;
const HL_LINES_RE = /\bhl_lines="([^"]+)"/;
const ATTR_LIST_RE = /\{\s*([^}]*)\s*\}/;

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
  if (rest.includes('showLineNumbers') || rest.includes('{')) {
    // Already translated or already an EC marker — preserve.
    if (!LINENUMS_RE.test(rest) && !HL_LINES_RE.test(rest)) return rest;
  }
  let parts: string[] = [];
  let working = rest.trimStart();

  // Capture language id (first whitespace-delimited token), but only when the
  // token is not itself an option keyword (e.g. hl_lines="3 4" with no lang).
  const langMatch = working.match(/^[A-Za-z0-9_+\-#.]+/);
  const langCandidate = langMatch === null ? '' : langMatch[0];
  // A token that includes `=` or starts with a known option prefix is not a
  // language id — treat it as part of the options that follow.
  const isOption =
    langCandidate.length === 0 ||
    langCandidate.includes('=') ||
    OPTION_PREFIX_RE.test(working);
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

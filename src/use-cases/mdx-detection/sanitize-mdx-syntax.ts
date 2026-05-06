/**
 * Sanitize CommonMark / Material syntax that breaks under MDX.
 *
 * Once the converter promotes a file to `.mdx`, the MDX parser turns
 * CommonMark idioms that were fine in `.md` into compile errors:
 *
 *   1. HTML comments `<!-- ... -->`: `!` is not a valid JSX tag-start.
 *   2. Auto-links `<https://...>`:   `<` opens JSX; `:` and `/` are
 *                                    invalid in JSX names.
 *   3. Heading anchors `{#id}`:      `{` opens a JS expression; `#` is
 *                                    invalid at expression start.
 *   4. Void elements `<br>` / `<hr>`: MDX requires explicit self-close.
 *
 * Each rewrite is fence-shielded and idempotent. Pure; used only on the
 * `.mdx` branch of `convertFile`.
 */

import { fenceMarker } from '../../domain/syntax/fence.js';
import { quoteUnquotedHtmlAttrs } from './quote-unquoted-attrs.js';

/** HTML void elements per the WHATWG spec. MDX requires explicit self-close. */
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/**
 * Lowercase HTML / SVG / MathML element names that may appear bare in
 * prose without raising a placeholder false-alarm. Only used to gate the
 * "lowercase tag with no attrs and no closer" → escape heuristic.
 *
 * Source: WHATWG HTML living standard + SVG 2 + MathML Core. We only need
 * lowercase names that authors actually use as bare tags in real
 * documentation (so `<animate>`, `<feGaussianBlur>`, etc. are excluded —
 * they require attributes and would have already been kept by the earlier
 * `=`/quote check).
 */
const KNOWN_HTML_ELEMENTS: ReadonlySet<string> = new Set([
  // HTML structural / sectioning
  'a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'blockquote',
  'body', 'button', 'canvas', 'caption', 'cite', 'code', 'colgroup', 'data',
  'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
  'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'html', 'i', 'iframe',
  'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map', 'mark', 'menu',
  'meter', 'nav', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output',
  'p', 'picture', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp',
  'script', 'search', 'section', 'select', 'slot', 'small', 'span', 'strong',
  'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template',
  'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'u', 'ul',
  'var', 'video', 'audio',
  // Common SVG bare tags
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'text', 'defs', 'use',
  // MathML
  'math', 'mi', 'mn', 'mo', 'mrow', 'msub', 'msup', 'mfrac', 'msqrt',
]);

/**
 * Optional collector for the strip transforms. When supplied, each stripped
 * PyMdown attr_list (block-level or inline) records its location and content
 * so the calling use-case can emit user-facing diagnostics. Without this,
 * strips are silent — appropriate for tests and ad-hoc text processing,
 * but not for real conversions where users need to know what was lost.
 */
export interface SanitizeReport {
  bareAttrLines: Array<{ line: number; content: string }>;
  inlineAttrLists: Array<{ line: number; column: number; content: string }>;
  spanAnchorsStripped: Array<{ line: number; anchorId: string }>;
}

export function sanitizeMdxSyntax(source: string, report?: SanitizeReport): string {
  let out = source;
  out = stripBareAttrListLines(out, report);
  out = stripInlineAttrLists(out, report);
  out = rewriteHtmlComments(out);
  out = rewriteAutolinks(out);
  out = escapeMkdocsIncludeMacros(out);
  out = escapeHeadingAnchors(out);
  out = stripSpanAnchorInHeadings(out, report);
  out = escapeStyleBlockBraces(out);
  // Make `<script>` block contents opaque BEFORE the placeholder/JSX
  // escapers — otherwise stray `<span class=\"x\">` inside JS strings
  // would either trip MDX or get mistakenly interpreted as a real tag.
  out = escapeScriptBlockContents(out);
  out = selfCloseVoidElements(out);
  // Quote unquoted HTML attribute values BEFORE the placeholder/angle-
  // bracket escapers run — `<div class=foo>` is valid HTML but invalid
  // JSX. Without this, the escapers either pass it through (and MDX
  // crashes) or escape the brackets unnecessarily. Real-world break:
  // thoughtspot/cs_tools/changelog uses `<div class=grid-define-columns
  // data-columns=2 markdown="block">` mid-document.
  out = quoteUnquotedHtmlAttrs(out);
  out = escapePlaceholderAngleBrackets(out);
  out = escapeAmbiguousLessThan(out);
  out = escapeOrphanOpenBrace(out);
  out = escapeMalformedAttrList(out);
  out = escapeOrphanFragmentDelimiters(out);
  return out;
}

/**
 * Escape literal `<>` and `</>` (empty JSX fragments) that appear as text
 * in the source without a matching closing/opening counterpart on the same
 * page. Real-world break (NHSDigital/rap-community-of-practice): a quick-
 * start guide describes GitHub's "Developer Settings" menu, which renders
 * with the `< >` octocat icon; the source writes it as a literal `<>`,
 * which MDX parses as a fragment opener and demands a `</>` closer.
 *
 * Detection: a `<>` is orphan when there's no matching `</>` later in the
 * page (and vice-versa). Both delimiters get escaped as HTML entities so
 * MDX renders the literal text and the page builds cleanly.
 *
 * Fence-shielded via `walkOutsideCode`.
 */
function escapeOrphanFragmentDelimiters(source: string): string {
  const opens = (source.match(/<>/g) ?? []).length;
  const closes = (source.match(/<\/>/g) ?? []).length;
  if (opens === closes) return source;
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '<') return null;
    if (src[i + 1] === '>') {
      out.push('&lt;&gt;');
      return i + 2;
    }
    if (src[i + 1] === '/' && src[i + 2] === '>') {
      out.push('&lt;/&gt;');
      return i + 3;
    }
    return null;
  });
}

/**
 * Strip standalone-line PyMdown `attr_list` blocks: a line whose only
 * non-whitespace content is `{ .class #id key="val" }`. PyMdown attaches
 * those attributes to the previous block (paragraph, list item, image,
 * etc.). MDX has no equivalent post-parse hook, and the bare `{...}` is
 * read as a JSX expression — which fails on `.class`/`#id`/CSS-shaped
 * contents that aren't valid JavaScript.
 *
 * Discriminator: contents contain `.identifier` (a class) or `key=value`
 * (a typed attribute). A line like `{someVar}` is left untouched — it's a
 * real JSX expression. A pure `{#id}` heading-anchor line is also left
 * alone so `escapeHeadingAnchors` can convert it to `\{#id\}` (visible to
 * the user, who needs to re-attach the anchor manually).
 *
 * Fence-shielded: `{ .card }` inside a fenced code block is preserved.
 */
export function stripBareAttrListLines(source: string, report?: SanitizeReport): string {
  const ATTR_LIST_LINE_RE = /^\s*\{([^{}\n]+)\}\s*$/;
  const SHAPE_RE = /(?:^|\s)\.[A-Za-z_][\w-]*|[A-Za-z_][\w-]*\s*=/;
  const lines = source.split('\n');
  const kept: string[] = [];
  // Track the opening fence's marker so a 3-tick line inside a 4-tick
  // fence (CommonMark §4.5) doesn't falsely toggle the state.
  let openFence: { char: '`' | '~'; length: number } | null = null;
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx] ?? '';
    const marker = fenceMarker(line);
    if (marker !== null) {
      if (openFence === null) {
        openFence = marker;
      } else if (marker.char === openFence.char && marker.length >= openFence.length) {
        openFence = null;
      }
      kept.push(line);
      continue;
    }
    if (openFence !== null) {
      kept.push(line);
      continue;
    }
    const m = line.match(ATTR_LIST_LINE_RE);
    if (m !== null && SHAPE_RE.test(m[1] ?? '')) {
      // Drop this line entirely; surrounding blank lines remain. The
      // 1-based line number reflects the original source so diagnostics
      // point users at the right line in the unconverted .md.
      report?.bareAttrLines.push({ line: idx + 1, content: line.trim() });
      continue;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * Strip inline `{ .class #id key=val }` attribute lists that PyMdown attaches
 * to *any* inline element — most commonly icon shortcodes (`:material-foo:{ .lg }`)
 * and emphasized text. Our `link-attr-list` normalizer handles the AST-level
 * link case; this catches the rest at the text level so MDX doesn't try to
 * acorn-parse `.lg .middle` as JavaScript and crash.
 *
 * Discriminator: every token inside the braces must be a valid attr-list
 * token (`.class`, `#id`, or `key=value` with quoted/unquoted value). A `{`
 * followed by anything else — `{user.name}`, `{0}`, `{() => x}` — is a real
 * JSX expression and is left alone.
 *
 * Fence-shielded via `walkOutsideCode`: code samples that document attr_list
 * syntax are preserved verbatim.
 */
export function stripInlineAttrLists(source: string, report?: SanitizeReport): string {
  const CLASS_TOKEN_RE = /^\.[\w-]+$/;
  const ID_TOKEN_RE = /^#[\w-]+$/;
  // Allow trailing `;` on the value (Material authors sometimes copy-paste
  // CSS-style attribute lists like `style="color: red;";`). The `;` is
  // stripped before the final `$` boundary check.
  const KV_TOKEN_RE = /^[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[\w-]+);?$/;
  // Bare flag attribute (PyMdown supports `{ data-tip-move }` as a boolean
  // attribute equivalent to `data-tip-move=""`). Real-world: pyodide
  // toolbox uses `{ .tooltip data-tip-txt="…" data-tip-move }` — without
  // accepting bare flags, the strip aborts on `data-tip-move` and the
  // whole `{...}` survives into MDX, where the `=` inside causes an
  // acorn parse failure.
  const FLAG_TOKEN_RE = /^[A-Za-z][\w-]*$/;
  return walkOutsideCode(source, (_out, src, i) => {
    if (src[i] !== '{') return null;
    // Skip `]{attrs}` ONLY when the `]` belongs to a remark BLOCK directive
    // (`:::name[label]{attrs}`). Earlier normalizers (e.g. `normalizeBlocks`
    // for pymdownx.blocks.details) emit this shape and downstream stages
    // depend on the attrs surviving to drive `<details>` / collapse rendering.
    // `:icon[clock]{ .lg .middle }` (a Material text-level icon shortcode
    // with PyMdown attr_list) is NOT a block directive — it must still be
    // stripped. Discriminator: a `:::` (3+ colons followed by an alphanumeric
    // directive name) appears earlier on the same line, before the `]`.
    if (i > 0 && src[i - 1] === ']' && precededByBlockDirective(src, i - 1)) {
      return null;
    }
    const end = src.indexOf('}', i + 1);
    if (end === -1) return null;
    const inner = src.slice(i + 1, end);
    if (inner.length === 0 || /[\n\r]/.test(inner)) return null;
    let trimmed = inner.trim();
    if (trimmed.length === 0) return null;
    // PyMdown's attr_list accepts an optional explicit `:` marker as the
    // first character (`{: .class }` is the canonical "explicit" form, vs
    // the bare `{ .class }`). Strip a leading colon (with surrounding
    // whitespace) so the rest of the body parses normally.
    if (trimmed.startsWith(':')) {
      trimmed = trimmed.slice(1).trimStart();
      if (trimmed.length === 0) return null;
    }
    // Authors sometimes leave a trailing `;` after the last attribute (a
    // CSS-ism). Tolerate it.
    if (trimmed.endsWith(';')) {
      trimmed = trimmed.slice(0, -1).trimEnd();
      if (trimmed.length === 0) return null;
    }
    // Split on whitespace, but keep `key="val with spaces"` intact.
    const tokens = splitAttrListTokens(trimmed);
    if (tokens === null) return null;
    let allValid = true;
    let hasClassOrKv = false;
    for (const t of tokens) {
      if (CLASS_TOKEN_RE.test(t) || KV_TOKEN_RE.test(t)) {
        hasClassOrKv = true;
        continue;
      }
      if (ID_TOKEN_RE.test(t)) continue;
      // PyMdown bare flag attribute (`data-tip-move`). Treat as a class/
      // attribute-shaped token so the strip proceeds. We require the token
      // to contain `-` OR be a known flag-shape — bare identifiers like
      // `note` (paragraph text mid-block) shouldn't trigger the strip.
      if (FLAG_TOKEN_RE.test(t) && /-/.test(t)) {
        hasClassOrKv = true;
        continue;
      }
      allValid = false;
      break;
    }
    if (!allValid) return null;
    // Pure `{#id}` (only `#id` tokens, no class/kv) is left alone so
    // `escapeHeadingAnchors` can rewrite it to `\{#id\}` — the user needs
    // to see the orphaned anchor and decide whether to re-attach it.
    if (!hasClassOrKv) return null;
    if (report !== undefined) {
      const place = lineColumnAt(src, i);
      report.inlineAttrLists.push({
        line: place.line,
        column: place.column,
        content: src.slice(i, end + 1),
      });
    }
    // Drop the entire `{...}` block. Don't push anything.
    return end + 1;
  });
}

/**
 * Count the number of consecutive `\` characters immediately before `index`.
 * Used by the inline-code state tracker to decide whether a `\`` is escaped
 * (odd count) or unescaped (even count, including zero).
 */
function countTrailingBackslashes(source: string, index: number): number {
  let n = 0;
  let j = index - 1;
  while (j >= 0 && source[j] === '\\') {
    n += 1;
    j -= 1;
  }
  return n;
}

/**
 * True when the line containing `bracketIndex` (a `]` position) opens with a
 * remark block directive: `:::` followed by an alphanumeric name. This marks
 * the `]{attrs}` block as directive metadata to preserve.
 */
function precededByBlockDirective(source: string, bracketIndex: number): boolean {
  // Walk back to the start of the line.
  let lineStart = bracketIndex;
  while (lineStart > 0 && source[lineStart - 1] !== '\n') lineStart -= 1;
  const line = source.slice(lineStart, bracketIndex);
  return /:{3,}\s*[A-Za-z][\w-]*/.test(line);
}

/** 1-based line + 1-based column for `index` within `source`. */
function lineColumnAt(source: string, index: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < index; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      lastNewline = i;
    }
  }
  return { line, column: index - lastNewline };
}

/**
 * Tokenize an attr-list body on whitespace, preserving quoted values so
 * `key="some value"` stays one token. Returns null on unterminated quotes.
 */
function splitAttrListTokens(body: string): string[] | null {
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i] ?? '')) i += 1;
    if (i >= body.length) break;
    const start = i;
    while (i < body.length && !/\s/.test(body[i] ?? '')) {
      const ch = body[i];
      if (ch === '"' || ch === "'") {
        const close = body.indexOf(ch, i + 1);
        if (close === -1) return null;
        i = close + 1;
        continue;
      }
      i += 1;
    }
    out.push(body.slice(start, i));
  }
  return out;
}

/**
 * Escape `{` chars that MDX would treat as an expression-opener but whose
 * body is not valid JS. Material sites paste code-like prose (Scala class
 * bodies, pseudo-code) inline, leaving lines such as
 * `outputMode: OutputMode) extends Sink {` that crash MDX with
 * "Unexpected end of file in expression".
 *
 * Two conservative heuristics:
 *   1. `{` followed by end-of-line (with optional trailing whitespace) is
 *      never a valid JSX expression — escape it.
 *   2. `{...}` whose body contains a remark-stringify backslash-escape
 *      (`\_`, `\:`, `\(`) is JSON-shaped table content, not JSX. acorn
 *      rejects it with "Could not parse expression". PowerTools
 *      `idempotency.mdx` hits this with `{"user\_id": 12391, ...}` in a
 *      table cell.
 *
 * `{` followed by `{`, `!`, `#`, or a JSX comment opener passes through —
 * those forms have dedicated rewriters above.
 */
function escapeOrphanOpenBrace(source: string): string {
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '{') return null;
    const next = src[i + 1] ?? '';
    if (next === '{' || next === '!' || next === '#') return null;
    if (next === '/' && src[i + 2] === '*') return null;
    // Heuristic 0a: `{>` or `{<` — CritiCMarkup-style brace openers that
    // survived earlier passes, e.g. `**{> [link] <}**` from
    // thoughtspot/cs_tools. acorn rejects expressions starting with `>`
    // or `<` in expression position. Always escape — JSX expressions
    // never start with these characters.
    if (next === '>' || next === '<') {
      out.push('&#123;');
      return i + 1;
    }
    // Heuristic 0: shell / template-literal `${VAR}` interpolation. MDX
    // reads `$` as text and `{...}` as a JSX expression that references an
    // undefined identifier — at RUNTIME, not parse time. Real-world:
    // Apache config blocks copy-pasted into Material docs include
    // `ErrorLog ${APACHE_LOG_DIR}/error.log`, which builds cleanly but
    // crashes the prerender with `ReferenceError: APACHE_LOG_DIR is not
    // defined`. The `$` immediately before `{` is the strongest signal we
    // get for "shell variable, not JSX".
    if (i > 0 && src[i - 1] === '$') {
      out.push('&#123;');
      return i + 1;
    }
    // Heuristic 1: `{` at end of line.
    let j = i + 1;
    while (j < src.length && (src[j] === ' ' || src[j] === '\t')) j += 1;
    if (j < src.length && src[j] === '\n') {
      out.push('&#123;');
      return i + 1;
    }
    // Heuristic 1b: `{` with no matching `}` anywhere on the same line.
    // Real-world (jujimeizuo/note/cs/others/regex.md): a markdown table
    // cell `| {  | repetition opener |` describes the regex `{` operator
    // as literal text. Without a closing brace on the line, MDX raises
    // "Unexpected end of file in expression". Conservative guard: only
    // escape when the next non-whitespace character is NOT a JSX expression
    // starter (letter, `$`, `_`, `(`, `[`, `{`) — that preserves
    // multi-line JSX like `{foo +\nbar}`.
    const eol = src.indexOf('\n', i + 1);
    const limit = eol === -1 ? src.length : eol;
    const close = src.indexOf('}', i + 1);
    if (close === -1 || close >= limit) {
      const peek = src[j] ?? '';
      if (!/[A-Za-z_$([{]/.test(peek)) {
        out.push('&#123;');
        return i + 1;
      }
      return null;
    }
    // Heuristic 1c: `{` inside a markdown table cell (preceded on the same
    // line by `|` with only whitespace between). Authors writing reference
    // tables for regex/grammars use `{n}`, `{n,}`, `{n,m}` etc. as literal
    // text describing repetition syntax — none of which is valid JS in
    // expression position (`{n,}` and `{n,m}` raise "Could not parse
    // expression with acorn"). Real-world: jujimeizuo/note/cs/others/regex.md.
    const lineStart = src.lastIndexOf('\n', i - 1) + 1;
    const beforeOnLine = src.slice(lineStart, i);
    if (/\|[ \t]*$/.test(beforeOnLine)) {
      out.push('&#123;');
      return i + 1;
    }
    // Heuristic 2: `{...}` with a backslash-escape inside the body — body
    // looks like remark-stringified table content, not JS.
    const body = src.slice(i + 1, close);
    if (body.includes('\\') && /\\[_*:()\[\]|<]/.test(body)) {
      out.push('&#123;');
      return i + 1;
    }
    // Heuristic 3: body ends with bare `...` before `}`. Real-world
    // (jujimeizuo/note/cs/pl/python/basic.md): Python dict-literal prose
    // like `{key: value, ...}`. acorn rejects the bare spread token with
    // "Could not parse expression with acorn". The trailing `...` (with no
    // value to spread) is unambiguous Python placeholder syntax — no real
    // JSX expression ends that way.
    if (/(?:^|[\s,])\.{3}\s*$/.test(body)) {
      out.push('&#123;');
      return i + 1;
    }
    // Heuristic 4: body ends with bare `,` before `}`. Real-world
    // (jujimeizuo/note/cs/others/regex.md): regex repetition syntax
    // `{n,}`, `{2,}`, `{0,}` written as inline literals in prose
    // describing the regex grammar. A trailing comma at the end of a JSX
    // expression body is a syntax error in JS — never valid JSX.
    if (/,\s*$/.test(body)) {
      out.push('&#123;');
      return i + 1;
    }
    return null;
  });
}

/**
 * Escape braces and angle brackets inside `<script>` blocks so MDX leaves
 * the script body alone. Real-world (jujimeizuo/note/index.md): an
 * embedded `<script>` contains JS source with `{...}` braces and string
 * literals like `"<span class=\"x\">"`. MDX parses children of a `<script>`
 * tag as MDX content, so the braces become JSX expressions and the escaped
 * `\"` before `class=` crashes the JSX attribute parser. HTML-entity
 * escaping the brackets makes the script body opaque text; the browser
 * un-escapes them at runtime so the JS still executes.
 *
 * Tag preservation matches `escapeStyleBlockBraces`: `<script>` opener
 * (with optional attributes) and `</script>` closer pass through verbatim.
 * Multiple script blocks in the same file each get their own pass.
 */
function escapeScriptBlockContents(source: string): string {
  return source.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_match, open, body, close) => {
      const escaped = (body as string)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\{/g, '&lcub;')
        .replace(/\}/g, '&rcub;');
      return `${open}${escaped}${close}`;
    },
  );
}

/**
 * Last-resort escape for `{...}` blocks that look like a malformed
 * PyMdown inline attr_list — `{target="\_blank}` (missing closing `"`).
 * Real-world Material sites contain these typos in source. The strict
 * `stripInlineAttrLists` pass requires balanced quotes; without that, the
 * `{` survives to MDX and crashes acorn. This pass runs after every other
 * brace handler (after `escapeHeadingAnchors` and `escapeOrphanOpenBrace`)
 * and escapes `{` when the body starts with an attr_list-shaped token
 * (`identifier=`) that we couldn't otherwise rescue.
 */
function escapeMalformedAttrList(source: string): string {
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '{') return null;
    // Skip directive attribute blocks: `:::name[label]{key="val"}`. The
    // admonition AST plugin emits Starlight v0.34+ icon attributes on
    // directive openers; escaping the `{` would break the directive parse.
    // Discriminator (matches stripInlineAttrLists): `]` immediately precedes
    // the `{` AND a `:::name` opener appears earlier on the same line.
    if (i > 0 && src[i - 1] === ']' && precededByBlockDirective(src, i - 1)) {
      return null;
    }
    // Find the matching `}` on the same line.
    const eol = src.indexOf('\n', i + 1);
    const limit = eol === -1 ? src.length : eol;
    const close = src.indexOf('}', i + 1);
    if (close === -1 || close >= limit) return null;
    const body = src.slice(i + 1, close).trim();
    if (body.length === 0) return null;
    // Heuristic: starts with `identifier=` (an attr_list opener). Real JSX
    // expressions don't use bare `key="value"` at the top level.
    if (!/^[A-Za-z_][\w-]*\s*=/.test(body)) return null;
    out.push('&#123;');
    return i + 1;
  });
}

/**
 * Strip Material's `<span id="…"> Heading text` anchor idiom from headings
 * AND from the start of paragraphs. Material lets users put a `<span>`
 * anchor inline; without a matching `</span>` the MDX parser raises
 * "Expected a closing tag for `<span>`". With a closing tag, the wrapper
 * is harmless but pollutes Starlight's auto-generated heading anchor
 * (Starlight derives the anchor from the heading text, not from a manual
 * `id`). Either shape — and any number of stacked `<span>` openers,
 * which Material sometimes emits when the same anchor has multiple aliases
 * — is rewritten to clean text and the explicit IDs are lost (matches our
 * existing behaviour for `### Heading {#id}`).
 *
 * Also handles paragraphs: a line that starts with one or more `<span ...>`
 * openers and otherwise contains plain text gets the wrappers stripped too,
 * so the MDX parser doesn't choke on the unmatched opener.
 */
function stripSpanAnchorInHeadings(source: string, report?: SanitizeReport): string {
  // Cover: ATX heading (`### `), escaped heading paragraph (`\### `),
  // unordered/ordered list item (`- `, `* `, `+ `, `1. `), and plain
  // paragraph. Anywhere a `<span ...>` opener appears at the start of the
  // text content (after the structural prefix) without a matching closer
  // on the same line, the wrapper is stripped.
  const PREFIX_RE = /^(\\?#{1,6}\s+|[-*+]\s+|\d+\.\s+)?/;
  const SPAN_OPEN_WITH_ATTRS_RE = /^<span\b([^>]*)>\s*/;
  // Match `</span>` at end-of-line OR mid-line. Real-world
  // (jujimeizuo/note/cs/others/regex.md): a list item like
  // `- <span style="…">(?<=pattern)</span>：匹配前面…` has its closer
  // mid-line. End-of-line-only matching leaves an orphan `</span>` after
  // the opener strip — MDX then errors with "Unexpected closing slash".
  const SPAN_CLOSE_ANY_RE = /\s*<\/span>\s*/;
  const ID_ATTR_RE = /\bid\s*=\s*"([^"]+)"|\bid\s*=\s*'([^']+)'/;
  return source
    .split('\n')
    .map((line, idx) => {
      const prefixMatch = line.match(PREFIX_RE);
      const prefix = prefixMatch?.[0] ?? '';
      let body = line.slice(prefix.length);
      if (!body.startsWith('<span')) return line;
      let stripped = false;
      let openMatch = body.match(SPAN_OPEN_WITH_ATTRS_RE);
      while (openMatch !== null) {
        const attrs = openMatch[1] ?? '';
        if (report !== undefined) {
          // Capture each anchor id separately so users see every dropped
          // cross-page link target. Without this signal, links like
          // `[…](page.md#foo)` silently break after migration.
          const idMatch = attrs.match(ID_ATTR_RE);
          const anchorId = idMatch?.[1] ?? idMatch?.[2] ?? '';
          if (anchorId.length > 0) {
            report.spanAnchorsStripped.push({ line: idx + 1, anchorId });
          }
        }
        body = body.slice(openMatch[0].length);
        stripped = true;
        openMatch = body.match(SPAN_OPEN_WITH_ATTRS_RE);
      }
      if (!stripped) return line;
      // Strip ONE `</span>` per opener that we removed — keeps the count
      // balanced and prevents removing closers unrelated to our strip.
      body = body.replace(SPAN_CLOSE_ANY_RE, ' ').trimEnd();
      return prefix + body;
    })
    .join('\n');
}

/**
 * Escape `{` and `}` inside `<style>...</style>` blocks so MDX does not try
 * to parse CSS rules as JS expressions. Real-world Material sites
 * (encode/uvicorn) inline a small `<style>` block in the landing page to
 * hide the H1; that survives into `.mdx` output and breaks the build
 * because `.foo { display: none; }` looks like a JSX expression to MDX.
 *
 * The fix: replace `{` with `&lcub;` and `}` with `&rcub;` inside the block.
 * Browser HTML rendering converts these back to literal braces, so the CSS
 * still applies. The opening and closing `<style>` tags are preserved
 * verbatim. Also handles `<style>` with attributes (e.g. `<style lang="css">`).
 */
function escapeStyleBlockBraces(source: string): string {
  return source.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match, open, body, close) => {
      const escaped = (body as string).replace(/\{/g, '&lcub;').replace(/\}/g, '&rcub;');
      return `${open}${escaped}${close}`;
    },
  );
}

/**
 * Escape angle brackets that look like JSX but are user-prose: snake_case
 * placeholders (`<package_name>`), kebab-case placeholders (`<your-name>`),
 * and Java/Scala generic types (`Optional<Foo>`, `Map<K, V>`). MDX raises a
 * fatal "Expected a closing tag" error for any of these because the source
 * never has a matching closing tag — it's not real JSX.
 *
 * Heuristic:
 *   1. Skip when the tag has whitespace inside (real JSX with attributes).
 *   2. Skip void/known elements (`br`, `hr`, etc.) — handled elsewhere.
 *   3. Escape when the inner contains `_` (snake_case placeholder).
 *   4. Escape when `<` is preceded by a letter or `)` (Java/Scala generics).
 *   5. Otherwise leave it alone.
 *
 * Conservative: only escapes the `<` and `>` that bound a single token —
 * does not touch surrounding text.
 */
function escapePlaceholderAngleBrackets(source: string): string {
  // Tag names whose openers we escape — their matching closing tags
  // (`</TagName>`) must also be escaped or MDX will error on the orphan.
  // Computed in a pre-walk so the main walk stays a streaming character
  // pass.
  const escapedOpenerNames = collectEscapedOpenerNames(source);

  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '<') return null;
    const next = src[i + 1] ?? '';

    // Closing tag `</firstWord>` whose opener was escaped → escape too.
    // Without this, MDX raises "Unexpected closing slash `/` in tag,
    // expected open tag first" on Apache-style blocks.
    if (next === '/' && escapedOpenerNames.size > 0) {
      const end = src.indexOf('>', i + 2);
      if (end !== -1) {
        const closerInner = src.slice(i + 2, end).trim();
        const closerName = (closerInner.match(/^[A-Za-z][A-Za-z0-9-]*/) ?? [''])[0];
        if (closerName.length > 0 && escapedOpenerNames.has(closerName)) {
          out.push('&lt;/', closerInner, '&gt;');
          return end + 1;
        }
      }
      return null;
    }

    if (!/[A-Za-z]/.test(next)) return null;
    const end = src.indexOf('>', i + 1);
    if (end === -1) return null;
    const inner = src.slice(i + 1, end);
    const decision = classifyAngleBracketed(src, i, end, inner);
    if (decision !== 'escape') return null;

    // Treat `<...>` content as opaque text and escape both delimiters. The
    // body itself is left alone (we only escape the angle brackets).
    out.push('&lt;', inner, '&gt;');
    return end + 1;
  });
}

/**
 * Pre-walk that returns the set of tag names whose openers will be escaped
 * by `escapePlaceholderAngleBrackets`. Used so the main walk can also
 * escape the matching `</TagName>` closers in the same pass.
 *
 * Pure: scans the source without mutating; uses the same fence-shielded
 * walker as the main pass so code-block content doesn't leak into the set.
 */
function collectEscapedOpenerNames(source: string): ReadonlySet<string> {
  const names = new Set<string>();
  // Drive the walker for its side effects only — we ignore its output.
  walkOutsideCode(source, (_out, src, i) => {
    if (src[i] !== '<') return null;
    const next = src[i + 1] ?? '';
    if (!/[A-Za-z]/.test(next)) return null;
    const end = src.indexOf('>', i + 1);
    if (end === -1) return null;
    const inner = src.slice(i + 1, end);
    const decision = classifyAngleBracketed(src, i, end, inner);
    if (decision !== 'escape') return null;
    const firstWord = (inner.replace(/\/$/, '').match(/^[A-Za-z][A-Za-z0-9-]*/) ?? [''])[0];
    if (firstWord.length > 0) names.add(firstWord);
    return null;
  });
  return names;
}

/**
 * Decide whether an `<...>` token at `[i, end]` should be escaped (treated
 * as code/prose) or kept (treated as JSX). Shared between
 * `escapePlaceholderAngleBrackets` (the main pass) and
 * `collectEscapedOpenerNames` (the pre-walk that identifies closers to
 * mirror) so the two passes stay in lockstep.
 */
function classifyAngleBracketed(
  src: string,
  i: number,
  end: number,
  inner: string,
): 'escape' | 'keep' {
  const tag = inner.replace(/\/$/, '');
  // Skip empty/closing fragments — closers are handled separately.
  if (tag.length === 0 || tag.startsWith('/')) return 'keep';
  const firstWord = (tag.match(/^[A-Za-z][A-Za-z0-9-]*/) ?? [''])[0];
  if (VOID_ELEMENTS.has(firstWord.toLowerCase())) return 'keep';

  // Decide: does this look like JSX (real tag) or like code/prose?
  const hasComma = /,/.test(inner);
  const hasUnderscore = /_/.test(tag);
  const hasNestedAngle = /</.test(inner);
  const hasEqualsOrQuote = /[="']/.test(inner);
  const hasMidSlash = /[^/]\/[^>]/.test(inner); // path-like content with mid-token slash
  const hasHash = /#/.test(inner); // anchored cross-references like `page#section`
  const prevChar = i > 0 ? src[i - 1] ?? '' : '';
  const followsLetterOrParen = /[A-Za-z)]/.test(prevChar);
  const followsEscapeSemi = prevChar === ';'; // likely `&lt;` or another HTML entity

  // Real JSX uses `=` and quotes for attributes; if those are present, keep.
  if (hasEqualsOrQuote) return 'keep';

  // Tail = whatever follows the firstWord inside `<...>`, after the optional
  // self-closing slash and any whitespace. Valid JSX without `=` allows an
  // empty tail (`<TagName>`, `<TagName />`) or a sequence of bare boolean
  // attributes (`<TagName disabled muted>`). Anything containing chars that
  // can't appear in a JSX attribute name (`*`, `:`, `.`, `+`, `@`, …) signals
  // an Apache/INI-config tag that MDX would reject with
  // "Unexpected character `.` in attribute name".
  const tail = inner.slice(firstWord.length).replace(/\/$/, '').trim();
  const tailTokens = tail.length === 0 ? [] : tail.split(/\s+/);
  const allTokensValidJsxAttrNames = tailTokens.every((t) => /^[A-Za-z_][\w-]*$/.test(t));
  const hasJsxIncompatibleTail = tail.length > 0 && !allTokensValidJsxAttrNames;

  // Bare lowercase tag (no attrs, no slash) that isn't a known HTML/SVG/
  // MathML element AND has no closer in the document → placeholder text
  // like `<port>`, `<host>`, `<your-name>`. The original heuristics in
  // `looksLikeCode` only catch placeholders with internal markers
  // (underscore, hash, slash); bare ones slip through.
  const isLowercase = /^[a-z]/.test(firstWord);
  const isBareTag = inner === firstWord; // no attrs, no self-close
  const isUnknownHtmlPlaceholder =
    isLowercase &&
    isBareTag &&
    firstWord.length > 0 &&
    !KNOWN_HTML_ELEMENTS.has(firstWord) &&
    src.indexOf(`</${firstWord}>`, end) === -1;

  // Self-closing form `<X />` paired with `</X>` later in the source is
  // malformed JSX — real JSX would either omit the closer (self-close
  // handles it) or omit the leading `/>` (paired open/close). The pattern
  // shows up in Apache config blocks: `<Location />…</Location>` is Apache
  // notation for the URI `/`, not a JSX self-close. When no real
  // (non-self-close) `<X ...>` opener appears between this position and
  // the closer, escape both — checked here BEFORE the looksLikeCode
  // early-return so cleanly-shaped Apache tags don't slip through.
  const isSelfClosingShape = inner.replace(/\s+$/, '').endsWith('/');
  if (isSelfClosingShape && firstWord.length > 0) {
    const closerIdx = src.indexOf(`</${firstWord}>`, end);
    if (closerIdx !== -1) {
      const between = src.slice(end + 1, closerIdx);
      const NON_SELF_CLOSE_OPENER = new RegExp(
        `<${escapeRegexLiteral(firstWord)}(?:>|\\s[^>]*[^/]>)`,
      );
      if (!NON_SELF_CLOSE_OPENER.test(between)) {
        return 'escape';
      }
    }
  }

  // Code-like patterns: `Map<K, V>`, `Optional<Foo>`, `<package_name>`,
  // `<path/with/slash>`, `<page#anchor>`, asciidoc `<<…>>` cross-refs
  // (where the outer `<<` got partially escaped to `&lt;<…>>`). Each is
  // unmistakably not JSX.
  const looksLikeCode =
    hasComma ||
    hasUnderscore ||
    hasNestedAngle ||
    hasMidSlash ||
    hasHash ||
    followsLetterOrParen ||
    followsEscapeSemi ||
    hasJsxIncompatibleTail ||
    isUnknownHtmlPlaceholder;
  if (!looksLikeCode) return 'keep';

  // Bail if the source contains a matching `</firstWord>` later — that means
  // it really is HTML/JSX (e.g. `H<sub>2</sub>O`, `<a href="…">x</a>`,
  // user-authored `<MyComponent>…</MyComponent>` mid-paragraph). Only when
  // no closer exists is the bracket pair unambiguously code-shaped text.
  // EXCEPTION: when the tail is JSX-incompatible (Apache-config shape),
  // the closer doesn't matter — MDX still rejects the opener's attribute
  // syntax, so escape regardless (and the closer gets escaped too via
  // `escapedOpenerNames`).
  if (
    !hasJsxIncompatibleTail &&
    firstWord.length > 0 &&
    src.indexOf(`</${firstWord}>`, end) !== -1
  ) {
    return 'keep';
  }

  return 'escape';
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape `<` characters that MDX cannot parse as either valid JSX or text.
 *
 * MDX requires the character after `<` to be a letter, `$`, `_`, or `/`
 * (closing tag). When we see `<` followed by anything else — typically a
 * digit (`<0.17.0` version comparator) or whitespace — escape the `<` to
 * `&lt;` so the page parses as text. Without this, real-world Material docs
 * that document version requirements or comparison operators raise a
 * fatal MDX parse error.
 *
 * Conservative: only escapes the `<` when the next character is a digit or
 * a non-name character that explicitly cannot start a JSX element. Lower-
 * case-letter starts (which are valid JSX intrinsic elements like `<div>`,
 * and also placeholder patterns like `<package_name>`) are left alone — the
 * placeholder case is documented separately as a known limitation.
 */
function escapeAmbiguousLessThan(source: string): string {
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '<') return null;
    const next = src[i + 1] ?? '';
    // Valid JSX-name starts: letter, `$`, `_`, `/` (closing tag), `>` (empty
    // fragment, rare). `!` is the HTML-comment opener; `rewriteHtmlComments`
    // runs before this and converts well-formed comments to `{/* ... */}`.
    // An orphan `<!` (no matching `-->`) survives to here and would still
    // crash MDX, so we escape its `<` too.
    if (/[A-Za-z$_/>]/.test(next)) return null;
    if (next === '!' && src.slice(i).match(/^<!-{2,}/) !== null) {
      // Looks like a comment-open with no detected close (otherwise it would
      // have been rewritten). Escape the leading `<` so MDX sees `&lt;!--…`.
    }
    out.push('&lt;');
    return i + 1;
  });
}

/**
 * Walk the source character-by-character, tracking fenced-code and inline-
 * code state. Calls `transform` on each character outside both code contexts;
 * inside code, characters are emitted verbatim.
 *
 * `transform(out, source, i, atLineStart)` should either return the new index
 * (after consuming any characters and pushing replacements onto `out`) or
 * `null` to signal "no rewrite, advance by one".
 */
function walkOutsideCode(
  source: string,
  transform: (
    out: string[],
    source: string,
    i: number,
    atLineStart: boolean,
  ) => number | null,
): string {
  const out: string[] = [];
  let i = 0;
  // Track the OPENING fence's marker char + length so we honour
  // CommonMark §4.5 (close requires same marker, ≥ same length). Real-
  // world (freya022/BotCommands-Wiki): a 4-backtick fence whose body
  // contained an inner ```java (3 backticks) was previously toggled
  // closed by the inner line — escapers then skipped the post-fence
  // prose and a stray `<--` crashed MDX.
  let openFence: { char: '`' | '~'; length: number } | null = null;
  let inInlineCode = false;
  let atLineStart = true;

  while (i < source.length) {
    if (atLineStart) {
      // The fence check is the only thing that requires "we're at line start
      // AND not inside inline code" — a fence line cannot start inside a
      // single-backtick inline span. But `atLineStart` itself MUST be cleared
      // after the first char of every line regardless of inInlineCode, or a
      // mid-line backtick run that happens to slice-match `isFenceLine` later
      // will incorrectly toggle the fence state. Real markdown-exec
      // regression: a stray backtick inside a blockquoted multi-fence block
      // left `atLineStart=true` while `inInlineCode=true`; once a later
      // backtick flipped `inInlineCode` off mid-line, the next iteration ran
      // the fence check on a mid-line slice of just-backticks and toggled
      // `inFence`, swallowing the rest of the document including a
      // valid `<https://…>` autolink that should have been rewritten.
      if (!inInlineCode) {
        const eol = source.indexOf('\n', i);
        const line = source.slice(i, eol === -1 ? source.length : eol);
        const marker = fenceMarker(line);
        if (marker !== null) {
          if (openFence === null) {
            // Opening a new fence.
            openFence = marker;
          } else if (
            marker.char === openFence.char &&
            marker.length >= openFence.length
          ) {
            // Valid closer: same marker, ≥ length.
            openFence = null;
          }
          // Otherwise: a fence-shaped line that doesn't match the opener —
          // treat as fence body (no toggle), CommonMark §4.5.
          const consumed = eol === -1 ? source.length - i : eol - i + 1;
          out.push(source.slice(i, i + consumed));
          i += consumed;
          atLineStart = true;
          continue;
        }
      }
      atLineStart = false;
    }

    const ch = source[i];
    if (ch === '\n') {
      out.push(ch);
      i += 1;
      atLineStart = true;
      // CommonMark: inline-code spans cannot span newlines. Reset the
      // inline-code state at every line break so a stray odd-count of
      // backticks on one line (real-world: PowerTools api_gateway.mdx
      // line 922 has 9 backticks because of a typo'd inline-code span)
      // does not poison every subsequent line, causing the rest of the
      // file to be treated as inline-code and skipping all sanitization
      // (HTML comments, void-element self-close, etc.).
      inInlineCode = false;
      continue;
    }
    if (openFence !== null) {
      out.push(ch ?? '');
      i += 1;
      continue;
    }
    if (ch === '`') {
      // CommonMark: a backtick preceded by an odd number of backslashes is
      // a literal backtick (escaped), not a code-span delimiter. Real-world
      // (pyodide-mkdocs-theme `python_libs.md`): an inline code fence
      // wrapper inside an admonition is stringified by remark as
      // `\\\`\\\`\\\`python { … }` — three backslash-escaped backticks. If
      // we toggle `inInlineCode` for each, we'd be in code-state when we
      // reach the `{`, and `escapeMalformedAttrList` would skip it,
      // letting MDX hit `title="…"` as a JSX expression and crash acorn.
      if (countTrailingBackslashes(source, i) % 2 === 1) {
        out.push(ch);
        i += 1;
        continue;
      }
      out.push(ch);
      inInlineCode = !inInlineCode;
      i += 1;
      continue;
    }
    if (inInlineCode) {
      out.push(ch ?? '');
      i += 1;
      continue;
    }
    const next = transform(out, source, i, false);
    if (next !== null) {
      i = next;
      continue;
    }
    out.push(ch ?? '');
    i += 1;
  }

  return out.join('');
}

function rewriteHtmlComments(source: string): string {
  // Run the escaped pass FIRST so that `&lt;!-- inner --&gt;` sequences nested
  // inside a literal `<!-- outer ... -->` get unwrapped to `{/* inner */}`
  // *before* the raw pass wraps the outer body. Without this order, the raw
  // pass runs first (no `*/` in body) and the second pass introduces nested
  // `{/* */}` inside an already-wrapped comment, producing a stray inner `*/`
  // that closes the outer JSX comment early. Real-world mkdocs-material
  // regression in `plugins/blog.md` (md:default annotation block).
  const out1 = rewriteEscapedHtmlComments(source);
  return rewriteRawHtmlComments(out1);
}

function rewriteRawHtmlComments(source: string): string {
  const COMMENT_OPEN = /^<!-{2,}/;
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '<' || src[i + 1] !== '!' || src[i + 2] !== '-' || src[i + 3] !== '-') {
      return null;
    }
    const slice = src.slice(i, i + 8);
    const m = slice.match(COMMENT_OPEN);
    if (m === null) return null;
    const openLen = (m[0] ?? '').length;
    const closeMatch = src.slice(i + openLen).match(/-{2,}>/);
    if (closeMatch === null || closeMatch.index === undefined) return null;
    const end = i + openLen + closeMatch.index;
    const body = src.slice(i + openLen, end);
    const closeLen = closeMatch[0]?.length ?? 3;
    out.push(`{/*${neutralizeJsxCommentClose(body)}*/}`);
    return end + closeLen;
  });
}

/**
 * Neutralize any literal `*\/` sequence inside a JSX block-comment body so
 * the comment doesn't terminate early. JS block comments do not nest, so a
 * body containing `*\/` (e.g. mkdocs-material's `<!-- md:default <code>{/* more *\/}</code> -->`)
 * would otherwise close at the inner `*\/` and leave the rest as broken JSX.
 *
 * The replacement `* /` (space) is invisible in rendered output (the comment
 * is stripped at compile time) and idempotent — `* /` does not match `*\/`.
 */
function neutralizeJsxCommentClose(body: string): string {
  return body.replace(/\*\//g, '* /');
}

/**
 * Rewrite HTML comments that remark already HTML-escaped on output. When
 * the source uses non-strict 3+-dash openers (`<!---`), remark-parse
 * doesn't recognise the block as a comment; the literal `<` becomes a
 * text node, and remark-stringify emits `&lt;!---…--&gt;`. The intent —
 * hidden content — is the same; rewrite to a JSX block comment so the
 * content stays out of the rendered page and the `&lt;!--…` artifact
 * doesn't crash MDX downstream.
 */
function rewriteEscapedHtmlComments(source: string): string {
  return source.replace(
    /&lt;!-{2,}([\s\S]*?)-{2,}&gt;/g,
    (_match, body) => `{/*${neutralizeJsxCommentClose(body as string)}*/}`,
  );
}

function rewriteAutolinks(source: string): string {
  // CommonMark autolinks come in two forms inside `<...>`:
  //   1. URI autolink:   `<scheme:rest>` — must contain a colon.
  //   2. Email autolink: `<user@host>`   — must contain `@`, no scheme.
  // MDX parses `<` as the start of JSX. Both forms break under MDX (URI: `:`
  // and `/` are invalid in tag names; Email: `@` is invalid). Rewrite to
  // explicit Markdown links, picking `mailto:` for email autolinks.
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '<') return null;
    const end = src.indexOf('>', i + 1);
    if (end === -1) return null;
    const inner = src.slice(i + 1, end);
    // Whitespace anywhere → not an autolink (per CommonMark spec).
    if (/\s/.test(inner)) return null;
    // URI autolink: scheme starts with a letter, then letters/digits/+-./, `:`.
    if (/^[a-z][a-z0-9+\-.]*:[^\s<>]+$/i.test(inner)) {
      out.push(`[${inner}](${inner})`);
      return end + 1;
    }
    // Email autolink (CommonMark §6.4): local-part `@` domain. The local-part
    // accepts the email-safe punctuation set; the domain is dot-separated
    // labels of letters/digits with optional hyphens (not at edges).
    if (
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(inner)
    ) {
      out.push(`[${inner}](mailto:${inner})`);
      return end + 1;
    }
    return null;
  });
}

function escapeHeadingAnchors(source: string): string {
  // Escape `{#anchor-id}` and `{ #anchor-id }` patterns — `{` followed by
  // optional whitespace, then `#`, then an identifier, then optional
  // whitespace and `}`. Material/Python-Markdown allow both spaced and
  // unspaced forms. Allow backslash-escaped underscores/hyphens because
  // remark-stringify produces them when serializing anchor labels (`\_`,
  // `\-`). Don't touch other `{...}` blocks — Jinja `{{...}}` is handled by
  // escapeJsxExpressionsForMdx, mkdocs `{!...!}` by escapeMkdocsIncludeMacros.
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '{') return null;
    // Skip optional whitespace between `{` and `#`.
    let cursor = i + 1;
    while (cursor < src.length && (src[cursor] === ' ' || src[cursor] === '\t')) {
      cursor += 1;
    }
    if (src[cursor] !== '#') return null;
    const end = src.indexOf('}', cursor + 1);
    if (end === -1) return null;
    // Strip trailing whitespace inside the brace body.
    let bodyEnd = end;
    while (bodyEnd > cursor && (src[bodyEnd - 1] === ' ' || src[bodyEnd - 1] === '\t')) {
      bodyEnd -= 1;
    }
    const body = src.slice(cursor, bodyEnd);
    if (!/^#[A-Za-z](?:[A-Za-z0-9._-]|\\[_-])*$/.test(body)) return null;
    out.push(`\\{${body}\\}`);
    return end + 1;
  });
}

function escapeMkdocsIncludeMacros(source: string): string {
  // mkdocs-include-markdown-plugin syntax: `{!./path/to/file.md!}`. MDX
  // parses `{` as JS expression opener, sees `!./...` and chokes (`!` is a
  // valid prefix operator in JS but `./` after it is not). Wrap in inline
  // backticks like `escapeJsxExpressionsForMdx` does for `{{...}}` so the
  // user can spot the unresolved include.
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '{' || src[i + 1] !== '!') return null;
    const end = src.indexOf('!}', i + 2);
    if (end === -1) return null;
    const block = src.slice(i, end + 2);
    out.push('`' + block + '`');
    return end + 2;
  });
}

function selfCloseVoidElements(source: string): string {
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '<') return null;
    const end = src.indexOf('>', i + 1);
    if (end === -1) return null;
    // Closing-tag form `</foo>`: void elements (`br`, `hr`, …) cannot have
    // a closing tag in HTML, but real-world Material docs frequently emit
    // `</br>` thinking it acts as a line break. MDX rejects the unmatched
    // closer with "expected corresponding closing tag". Rewrite the closer
    // to a self-closed opener (`<br/>`) so the intent is preserved.
    if (src[i + 1] === '/') {
      const inner = src.slice(i + 2, end);
      const closeName = inner.trim().toLowerCase();
      if (closeName.length > 0 && VOID_ELEMENTS.has(closeName)) {
        out.push(`<${closeName}/>`);
        return end + 1;
      }
      return null;
    }
    const inner = src.slice(i + 1, end);
    if (inner.endsWith('/')) return null;  // already self-closed
    const nameMatch = inner.match(/^([a-z][a-z0-9-]*)(\s|$)/i);
    if (nameMatch === null) return null;
    const tagName = (nameMatch[1] ?? '').toLowerCase();
    if (!VOID_ELEMENTS.has(tagName)) return null;
    // Insert ` /` before the `>`. Strip a trailing space to avoid `  />`.
    const rest = inner.replace(/\s+$/, '');
    out.push(`<${rest}/>`);
    return end + 1;
  });
}

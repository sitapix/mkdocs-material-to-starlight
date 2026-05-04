/**
 * Sanitize CommonMark / Material syntax that becomes a parse error under MDX.
 *
 * Background: when our converter promotes a file to `.mdx` (because the body
 * uses Starlight components, JSX, or other MDX-only constructs), the parser
 * tightens its rules. CommonMark idioms that were fine in `.md` turn into MDX
 * compile errors:
 *
 *   1. HTML comments `<!-- ... -->`     — `!` is not a valid JSX tag-start.
 *   2. Auto-links `<https://...>`       — `<` opens JSX; `:` and `/` are not
 *                                          valid JSX-name characters.
 *   3. Heading anchors `{#id}`          — `{` opens a JSX expression and `#`
 *                                          is invalid JS at expression start.
 *   4. Void HTML elements `<br>`/`<hr>` — MDX requires explicit self-close.
 *
 * Each rewrite is fence-shielded (skips fenced code and inline code) and
 * idempotent so this can be re-run without churning the output.
 *
 * Pure: text → text. Used only on the `.mdx` branch of `convertFile`.
 */

const FENCE_RE = /^ {0,3}(```|~~~)/;

/** HTML void elements per the WHATWG spec. MDX requires explicit self-close. */
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

export function sanitizeMdxSyntax(source: string): string {
  let out = source;
  out = rewriteHtmlComments(out);
  out = rewriteAutolinks(out);
  out = escapeMkdocsIncludeMacros(out);
  out = escapeHeadingAnchors(out);
  out = stripSpanAnchorInHeadings(out);
  out = escapeStyleBlockBraces(out);
  out = selfCloseVoidElements(out);
  out = escapePlaceholderAngleBrackets(out);
  out = escapeAmbiguousLessThan(out);
  out = escapeOrphanOpenBrace(out);
  return out;
}

/**
 * Escape `{` characters that MDX would interpret as an expression-opener
 * but that are followed by content which is not a valid JS expression.
 * Real-world Material sites paste code-like prose (Scala class bodies,
 * pseudo-code) inline without fencing, leaving lines such as
 * `outputMode: OutputMode) extends Sink {` that crash MDX with
 * "Unexpected end of file in expression".
 *
 * Heuristic: a `{` that is immediately followed by end-of-line (optionally
 * with trailing whitespace) is never a valid JSX expression — escape it.
 * `{` followed by `{` / `!` / `#` / a JSX comment opener is left alone
 * because those are handled by the dedicated rewriters above (`{{ Jinja }}`,
 * `{!include!}`, `{#anchor}`, JSX-style block comments).
 */
function escapeOrphanOpenBrace(source: string): string {
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '{') return null;
    const next = src[i + 1] ?? '';
    if (next === '{' || next === '!' || next === '#') return null;
    if (next === '/' && src[i + 2] === '*') return null;
    // Only escape when `{` is followed by end-of-line (with optional trailing
    // whitespace before the newline). This deliberately misses `{` mid-line —
    // those are usually intentional JSX expressions or already-escaped braces.
    let j = i + 1;
    while (j < src.length && (src[j] === ' ' || src[j] === '\t')) j += 1;
    if (j >= src.length || src[j] !== '\n') return null;
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
function stripSpanAnchorInHeadings(source: string): string {
  // Cover: ATX heading (`### `), escaped heading paragraph (`\### `),
  // unordered/ordered list item (`- `, `* `, `+ `, `1. `), and plain
  // paragraph. Anywhere a `<span ...>` opener appears at the start of the
  // text content (after the structural prefix) without a matching closer
  // on the same line, the wrapper is stripped.
  const PREFIX_RE = /^(\\?#{1,6}\s+|[-*+]\s+|\d+\.\s+)?/;
  const SPAN_OPEN_RE = /^<span\b[^>]*>\s*/;
  const SPAN_CLOSE_TAIL_RE = /\s*<\/span>\s*$/;
  return source
    .split('\n')
    .map((line) => {
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
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '<') return null;
    const next = src[i + 1] ?? '';
    if (!/[A-Za-z]/.test(next)) return null;
    const end = src.indexOf('>', i + 1);
    if (end === -1) return null;
    const inner = src.slice(i + 1, end);
    const tag = inner.replace(/\/$/, '');
    // Skip empty/closing fragments.
    if (tag.length === 0 || tag.startsWith('/')) return null;
    // Skip known HTML void elements (handled by selfCloseVoidElements).
    const firstWord = (tag.match(/^[A-Za-z][A-Za-z0-9-]*/) ?? [''])[0];
    if (VOID_ELEMENTS.has(firstWord.toLowerCase())) return null;

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
    if (hasEqualsOrQuote) return null;
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
      followsEscapeSemi;
    if (!looksLikeCode) return null;

    // Bail if the source contains a matching `</firstWord>` later — that means
    // it really is HTML/JSX (e.g. `H<sub>2</sub>O`, `<a href="…">x</a>`,
    // user-authored `<MyComponent>…</MyComponent>` mid-paragraph). Only when
    // no closer exists is the bracket pair unambiguously code-shaped text.
    if (firstWord.length > 0 && src.indexOf(`</${firstWord}>`, end) !== -1) {
      return null;
    }

    // Treat `<...>` content as opaque text and escape both delimiters. The
    // body itself is left alone (we only escape the angle brackets).
    out.push('&lt;', inner, '&gt;');
    return end + 1;
  });
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
  let inFence = false;
  let inInlineCode = false;
  let atLineStart = true;

  while (i < source.length) {
    if (atLineStart && !inInlineCode) {
      const eol = source.indexOf('\n', i);
      const line = source.slice(i, eol === -1 ? source.length : eol);
      if (FENCE_RE.test(line)) {
        inFence = !inFence;
        const consumed = eol === -1 ? source.length - i : eol - i + 1;
        out.push(source.slice(i, i + consumed));
        i += consumed;
        atLineStart = true;
        continue;
      }
      atLineStart = false;
    }

    const ch = source[i];
    if (ch === '\n') {
      out.push(ch);
      i += 1;
      atLineStart = true;
      continue;
    }
    if (inFence) {
      out.push(ch ?? '');
      i += 1;
      continue;
    }
    if (ch === '`') {
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
  // First pass: rewrite raw `<!--…-->` (and n-dash variants) that survived
  // remark-stringify intact. CommonMark/remark only recognises the strict
  // 2-dash form as an HTML block; 3+ dashes are parsed as plain text and
  // emitted as `&lt;!--+…--+&gt;` (HTML-escaped). The second pass handles
  // that escaped form.
  const out1 = rewriteRawHtmlComments(source);
  return rewriteEscapedHtmlComments(out1);
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
    out.push(`{/*${body}*/}`);
    return end + closeLen;
  });
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
    (_match, body) => `{/*${body}*/}`,
  );
}

function rewriteAutolinks(source: string): string {
  // `<scheme:rest>` where scheme is a URL scheme or `mailto`. MDX won't accept
  // these as raw — convert to a Markdown link `[scheme:rest](scheme:rest)`.
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '<') return null;
    const end = src.indexOf('>', i + 1);
    if (end === -1) return null;
    const inner = src.slice(i + 1, end);
    // Whitespace anywhere → not an autolink.
    if (/\s/.test(inner)) return null;
    // Must look like url-scheme:something or mailto:something.
    if (!/^[a-z][a-z0-9+\-.]*:[^\s<>]+$/i.test(inner)) return null;
    out.push(`[${inner}](${inner})`);
    return end + 1;
  });
}

function escapeHeadingAnchors(source: string): string {
  // Only escape `{#anchor-id}` patterns — `{` followed by `#` then an
  // identifier and `}`. Allow backslash-escaped underscores/hyphens because
  // remark-stringify produces them when serializing anchor labels (`\_`,
  // `\-`). Don't touch other `{...}` blocks — Jinja `{{...}}` is handled by
  // escapeJsxExpressionsForMdx, mkdocs `{!...!}` by escapeMkdocsIncludeMacros.
  return walkOutsideCode(source, (out, src, i) => {
    if (src[i] !== '{') return null;
    if (src[i + 1] !== '#') return null;
    const end = src.indexOf('}', i + 2);
    if (end === -1) return null;
    const body = src.slice(i + 1, end);
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
    // Match `<tagname ...>` where tagname is a void element. Don't match
    // closing `</tag>` or already-self-closed `<tag/>`.
    if (src[i + 1] === '/') return null;
    const end = src.indexOf('>', i + 1);
    if (end === -1) return null;
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

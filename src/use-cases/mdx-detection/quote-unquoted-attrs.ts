/**
 * Quote unquoted HTML attribute values so MDX's stricter JSX parser
 * accepts the tag. HTML (per WHATWG) allows attribute values without
 * surrounding quotes when they contain no whitespace, `>`, `=`, single
 * or double quotes, or backticks — `<div class=foo>` is valid HTML.
 * JSX/MDX rejects this shape with `"Unexpected character 'X' before
 * attribute value, expected a character that can start an attribute
 * value, such as '"', "'", or '{'"`. Real-world break:
 * thoughtspot/cs_tools (`<div class=grid-define-columns data-columns=2 markdown="block">`).
 *
 * Conservative scope:
 *   - Only operates on a tag's attribute list (between opener `<` and
 *     closing `>`), and only outside fenced/inline code spans.
 *   - Already-quoted values (`href="..."`, `class='...'`) pass through.
 *   - JSX expression values (`prop={expr}`) pass through.
 *   - Boolean attributes (`disabled`, `checked`) pass through.
 *
 * Pure: text in, text out. Idempotent.
 */

import { fenceMarker } from '../../domain/syntax/fence.js';

const ATTR_NAME = String.raw`[A-Za-z_][\w:.-]*`;

export function quoteUnquotedHtmlAttrs(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let openFence: { char: '`' | '~'; length: number } | null = null;
  for (const line of lines) {
    const marker = fenceMarker(line);
    if (marker !== null) {
      if (openFence === null) {
        openFence = marker;
      } else if (marker.char === openFence.char && marker.length >= openFence.length) {
        openFence = null;
      }
      out.push(line);
      continue;
    }
    if (openFence !== null) {
      out.push(line);
      continue;
    }
    out.push(rewriteLineOutsideInlineCode(line));
  }
  return out.join('\n');
}

/**
 * Walk the line character by character, splitting at backtick-delimited
 * inline code spans. Apply the attribute-quoting rewrite to every
 * non-inline-code segment.
 */
function rewriteLineOutsideInlineCode(line: string): string {
  // Fast path: no `<`, nothing to do.
  if (!line.includes('<')) return line;
  const out: string[] = [];
  let i = 0;
  let inInlineCode = false;
  let buf = '';
  while (i < line.length) {
    const ch = line[i] ?? '';
    if (ch === '`') {
      // Toggle inline-code state. Flush the buffer (with rewrite if we
      // were OUTSIDE code) before flipping.
      if (inInlineCode) {
        out.push(buf);
        buf = '';
      } else {
        out.push(rewriteSegment(buf));
        buf = '';
      }
      out.push(ch);
      inInlineCode = !inInlineCode;
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  if (inInlineCode) {
    out.push(buf);
  } else {
    out.push(rewriteSegment(buf));
  }
  return out.join('');
}

/**
 * Within an out-of-code text segment, find each `<TagName ...>` opener
 * and rewrite its attribute list to quote unquoted values. Self-closing
 * tags and tag names of any case are accepted; closing tags (`</X>`)
 * have no attribute list and pass through.
 */
function rewriteSegment(segment: string): string {
  // Match an opening tag with an attribute list. Closing tags and tags
  // without attributes (`<div>`, `</div>`) are skipped because their
  // body has no `=` to bother quoting.
  const TAG_RE = new RegExp(
    String.raw`<` +                    // opener
    String.raw`(${ATTR_NAME})` +       // tag name
    String.raw`(\s+[^>]*?)` +          // attribute list (non-empty)
    String.raw`(/?)>`,                 // optional self-close
    'g',
  );
  return segment.replace(TAG_RE, (match, tagName: string, attrs: string, selfClose: string) => {
    // If the attribute list contains a `{`, we're looking at real JSX
    // with expression values — possibly nested (`icon={<Icon />}`). The
    // simple token regex below can't follow nested braces or angle
    // brackets safely; skip rewriting to avoid mangling. The cs_tools
    // case (and 99% of real-world breakage) has zero `{` in the attrs.
    if (attrs.includes('{')) return match;
    const rewritten = quoteAttrList(attrs);
    if (rewritten === attrs) return match;
    return `<${tagName}${rewritten}${selfClose}>`;
  });
}

function quoteAttrList(attrs: string): string {
  // Walk each `name[=value]` token. The token regex accepts:
  //   1. Already-quoted values: `name="..."` or `name='...'` (passthrough)
  //   2. JSX expression values: `name={...}` (passthrough)
  //   3. Unquoted values: `name=value` → rewrite to `name="value"`
  //   4. Boolean attributes: bare `name` (passthrough)
  // Mid-attribute whitespace is preserved.
  const TOKEN_RE = new RegExp(
    String.raw`(\s+)` +                                           // leading whitespace
    String.raw`(${ATTR_NAME})` +                                  // attribute name
    String.raw`(?:` +                                              // optional value:
      String.raw`(=)` +                                            //   `=`
      String.raw`(?:` +
        String.raw`("[^"]*"|'[^']*')` +                            //   already-quoted
        String.raw`|(\{[^{}]*\})` +                                //   JSX expression
        String.raw`|([^\s"'\`<>=\/]+)` +                           //   unquoted value
      String.raw`)` +
    String.raw`)?`,
    'g',
  );
  return attrs.replace(TOKEN_RE, (
    _full,
    leading: string,
    name: string,
    eq: string | undefined,
    quoted: string | undefined,
    expr: string | undefined,
    bare: string | undefined,
  ) => {
    if (eq === undefined) {
      // Boolean attribute, no value.
      return `${leading}${name}`;
    }
    if (quoted !== undefined) return `${leading}${name}=${quoted}`;
    if (expr !== undefined) return `${leading}${name}=${expr}`;
    if (bare !== undefined) return `${leading}${name}="${bare}"`;
    return `${leading}${name}`;
  });
}

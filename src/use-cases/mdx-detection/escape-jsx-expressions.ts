/**
 * Sanitize Jinja2 `{{ ... }}`, `{% ... %}`, and `{# ... #}` expressions in
 * source destined for `.mdx`. MDX treats `{` as a JS-expression opener, so
 * leaving `{{ version }}` or `{% if x %}` makes Astro's parser try to
 * evaluate them as JSX and fail.
 *
 * Shapes handled: variable (`{{ value }}`), control (`{% block %}`),
 * comment (`{# comment #}`).
 *
 * Rewrites:
 *   - Single-line: wrap in inline backticks. Renders as inline code,
 *     stays grep-able, and satisfies MDX.
 *   - Multi-line: openers and closers escape to HTML entities
 *     (`&#123;&#123;`, `&#37;`, `&#35;`).
 *
 * Operates outside fenced and inline code. Idempotent (already-backticked
 * or entity-escaped Jinja passes through).
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

export function escapeJsxExpressionsForMdx(source: string): string {
  // Pass 1: rewrite single-line `{{...}}` outside code into inline-backtick form.
  const passOne = rewriteSingleLine(source);
  // Pass 2: any remaining `{{` (which must be multi-line) → entity-escape both
  // the open and close pair. Operates on the whole string so the pair-walk can
  // span line boundaries.
  return rewriteMultiLine(passOne);
}

function rewriteSingleLine(source: string): string {
  const lines = source.split('\n');
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
    output.push(rewriteOutsideBackticks(line));
  }

  return output.join('\n');
}

function rewriteOutsideBackticks(line: string): string {
  // Walk the line, toggling inside/outside backtick state and tracking
  // markdown-link URL context. Only rewrite in outside-state segments.
  //
  // Backtick-wrap form is great for inline prose (renders as monospace,
  // grep-able) but is *toxic* inside a link target `[text](url)` — a
  // backtick inside the URL gets parsed as the start of an inline-code
  // span by remark, which then splits the link and produces a malformed
  // structure that cascades into MDX acorn errors. Real-world (cv4x/
  // svstudio-manual): `[git: {{ short }}](https://x/commit/{{ short }})`
  // turned into `[text `{{ short }}`]( ... `{{ ... )` — broken.
  //
  // Inside a URL, fall back to entity escapes (`&#123;&#123;` etc.):
  // satisfies MDX without inserting characters the link parser cares about.
  let out = '';
  let i = 0;
  let inCode = false;
  let inLinkUrl = false;
  let linkUrlParenDepth = 0;
  while (i < line.length) {
    const ch = line[i];
    if (!inCode && !inLinkUrl && ch === ']' && line[i + 1] === '(') {
      // Enter link-URL context. The transition is `](` — we emit both
      // characters and start tracking paren depth from 1.
      out += '](';
      inLinkUrl = true;
      linkUrlParenDepth = 1;
      i += 2;
      continue;
    }
    if (inLinkUrl) {
      // Track nested parens inside URLs (Wikipedia-style `(foo)` segments).
      if (ch === '(') {
        linkUrlParenDepth += 1;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === ')') {
        linkUrlParenDepth -= 1;
        out += ch;
        i += 1;
        if (linkUrlParenDepth === 0) inLinkUrl = false;
        continue;
      }
      // Inside the URL: entity-escape Jinja braces instead of backtick-
      // wrapping.
      const slice = line.slice(i);
      const jinja = matchJinjaExpression(slice);
      if (jinja !== null) {
        out += entityEscapeJinja(jinja);
        i += jinja.length;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '`') {
      out += ch;
      inCode = !inCode;
      i += 1;
      continue;
    }
    if (inCode) {
      out += ch;
      i += 1;
      continue;
    }
    const slice = line.slice(i);
    const jinja = matchJinjaExpression(slice);
    if (jinja !== null) {
      out += `\`${jinja}\``;
      i += jinja.length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Replace the leading and trailing brace pair of a Jinja expression with
 *  HTML entities, leaving the body untouched. Used inside markdown-link
 *  URLs where backticks would split the link target. */
function entityEscapeJinja(jinja: string): string {
  if (jinja.startsWith('{{') && jinja.endsWith('}}')) {
    return `&#123;&#123;${jinja.slice(2, -2)}&#125;&#125;`;
  }
  if (jinja.startsWith('{%') && jinja.endsWith('%}')) {
    return `&#123;%${jinja.slice(2, -2)}%&#125;`;
  }
  if (jinja.startsWith('{#') && jinja.endsWith('#}')) {
    return `&#123;#${jinja.slice(2, -2)}#&#125;`;
  }
  return jinja;
}

function matchJinjaExpression(slice: string): string | null {
  // {{ var }} / {{var}} — body is anything up to next `}}` (no `}` allowed mid-body).
  const varMatch = slice.match(/^\{\{[^}]+\}\}/);
  if (varMatch !== null) return varMatch[0];
  // {% block %} / {%- block -%} — body is anything up to next `%}` (no
  // standalone `%` allowed mid-body except as part of `%}` close).
  const blockMatch = slice.match(/^\{%-?[\s\S]*?-?%\}/);
  if (blockMatch !== null && !blockMatch[0].includes('\n')) return blockMatch[0];
  // {# comment #} — body up to `#}`.
  const commentMatch = slice.match(/^\{#[\s\S]*?#\}/);
  if (commentMatch !== null && !commentMatch[0].includes('\n')) return commentMatch[0];
  return null;
}

/**
 * Rewrite multi-line `{{ ... }}` spans by entity-escaping the brace pairs.
 * Walks the source character by character, tracks fence/inline-code state, and
 * rewrites only `{{` / `}}` that sit outside both. Idempotent — `&#123;&#123;`
 * does not match `{{`, so a second pass is a no-op.
 */
function rewriteMultiLine(source: string): string {
  let out = '';
  let i = 0;
  let inFence = false;
  let inInlineCode = false;
  let atLineStart = true;

  while (i < source.length) {
    if (atLineStart) {
      // Detect a fence boundary on this line.
      const eol = source.indexOf('\n', i);
      const line = source.slice(i, eol === -1 ? source.length : eol);
      if (isFenceLine(line) && !inInlineCode) {
        inFence = !inFence;
        const consumed = eol === -1 ? source.length - i : eol - i + 1;
        out += source.slice(i, i + consumed);
        i += consumed;
        atLineStart = true;
        continue;
      }
      atLineStart = false;
    }

    const ch = source[i];
    if (ch === '\n') {
      out += ch;
      i += 1;
      atLineStart = true;
      continue;
    }
    if (inFence) {
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '`') {
      out += ch;
      inInlineCode = !inInlineCode;
      i += 1;
      continue;
    }
    if (inInlineCode) {
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '{' && source[i + 1] === '{') {
      out += '&#123;&#123;';
      i += 2;
      continue;
    }
    if (ch === '}' && source[i + 1] === '}') {
      out += '&#125;&#125;';
      i += 2;
      continue;
    }
    // Multi-line Jinja block / comment opening — entity-escape the leading
    // brace so MDX doesn't see a JSX expression-opener. The matching close
    // (`%}` / `#}`) is fine for MDX as written; only the leading `{` matters.
    if (ch === '{' && (source[i + 1] === '%' || source[i + 1] === '#')) {
      out += '&#123;';
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }

  return out;
}

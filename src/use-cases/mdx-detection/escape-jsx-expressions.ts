/**
 * Sanitize Jinja2-style `{{ ... }}` expressions in source destined for `.mdx`
 * output. MDX treats `{` as the opener for a JS expression — leaving
 * `{{ version }}` in `.mdx` source makes Astro's MDX parser try to evaluate
 * it as `{ {version} }` (an object literal containing an undefined identifier)
 * and fail the build.
 *
 * Two rewrite shapes:
 *   - Single-line `{{ ... }}` → wrapped in inline backticks `` `{{ ... }}` ``.
 *   - Multi-line `{{ ... \n ... }}` → opening `{{` and closing `}}` escaped to
 *     `&#123;&#123;` and `&#125;&#125;` (HTML entities). Inline-code can't
 *     span lines, so backslash-escapes plus HTML entities are the safe path.
 *
 * Operates outside fenced code blocks and inline-code spans. Idempotent —
 * `{{ ... }}` already inside backticks or already entity-escaped is preserved.
 */

const FENCE_RE = /^ {0,3}(```|~~~)/;

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
    if (FENCE_RE.test(line)) {
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
  // Walk the line, toggling inside/outside backtick state. Only rewrite in
  // outside-state segments. This preserves `{{ var }}` already inside an
  // inline-code span (the user's own escape).
  let out = '';
  let i = 0;
  let inCode = false;
  while (i < line.length) {
    const ch = line[i];
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
    // Try to match a {{...}} expression starting at i.
    const slice = line.slice(i);
    const match = slice.match(/^\{\{[^}]+\}\}/);
    if (match !== null) {
      out += `\`${match[0]}\``;
      i += match[0].length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
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
      if (FENCE_RE.test(line) && !inInlineCode) {
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
    out += ch;
    i += 1;
  }

  return out;
}

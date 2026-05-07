/**
 * Pre-parse normalizer: entity-escape Jinja `{{...}}`, `{%...%}`, and
 * `{#...#}` braces *inside* the URL portion of markdown links.
 *
 * Real-world (cv4x_svstudio-manual/docs/index.md): a "last update" line
 * embeds a Jinja template variable in a link target:
 *
 *   [text {{ git.short_commit }}](https://x/commit/{{ git.short_commit }})
 *
 * remark-parse refuses to recognize this construct as a link — the `{{`
 * inside `(...)` makes it abort link-target parsing — and emits the whole
 * thing as escaped plain text (`\[text {{ ...}}]\(<https://...{{> ...)`).
 * That cascades into multiple malformed mini-links and the downstream MDX
 * acorn parser fails.
 *
 * Fix: walk the source character-by-character, track inline-code and link
 * contexts, and replace the brace pair of every Jinja expression sitting
 * between a markdown link's `](` and its matching `)` with HTML entities
 * (`&#123;&#123; ... &#125;&#125;`). The body of the expression is left
 * untouched so the original variable name stays grep-able.
 *
 * Conservative — only fires inside link URLs, never in prose or fenced
 * code. Idempotent (entity-escaped braces don't re-match).
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

export function normalizeJinjaInLinkUrls(source: string): string {
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
    output.push(rewriteLine(line));
  }
  return output.join('\n');
}

function rewriteLine(line: string): string {
  let out = '';
  let i = 0;
  let inCode = false;
  let inLinkUrl = false;
  let parenDepth = 0;
  while (i < line.length) {
    const ch = line[i];
    if (!inCode && !inLinkUrl && ch === ']' && line[i + 1] === '(') {
      out += '](';
      inLinkUrl = true;
      parenDepth = 1;
      i += 2;
      continue;
    }
    if (inLinkUrl) {
      if (ch === '(') {
        parenDepth += 1;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === ')') {
        parenDepth -= 1;
        out += ch;
        i += 1;
        if (parenDepth === 0) inLinkUrl = false;
        continue;
      }
      const slice = line.slice(i);
      const jinja = matchJinja(slice);
      if (jinja !== null) {
        out += entityEscape(jinja);
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
    out += ch;
    i += 1;
  }
  return out;
}

function matchJinja(slice: string): string | null {
  const varMatch = slice.match(/^\{\{[^}]+\}\}/);
  if (varMatch !== null) return varMatch[0];
  const blockMatch = slice.match(/^\{%-?[\s\S]*?-?%\}/);
  if (blockMatch !== null && !blockMatch[0].includes('\n')) return blockMatch[0];
  const commentMatch = slice.match(/^\{#[\s\S]*?#\}/);
  if (commentMatch !== null && !commentMatch[0].includes('\n')) return commentMatch[0];
  return null;
}

function entityEscape(jinja: string): string {
  // Whitespace inside the body becomes `%20`. CommonMark §6.6 (link
  // destinations in parentheses) forbids unescaped whitespace; without
  // this, `(URL/{{ var }})` still bails out of link parsing even though
  // the braces themselves are entity-encoded. Real-world: cv4x/svstudio-
  // manual's `commit/{{ git.short_commit }}` has spaces that survived
  // the brace-only escape and remark-parse still treated the whole link
  // as text. URL-encoding the spaces keeps the destination grammatically
  // valid; the browser decodes `%20` back to a space at runtime, so the
  // (already-broken-in-Astro) Jinja template URL keeps its source intent.
  const encodeBody = (body: string): string => body.replace(/\s/g, '%20');
  if (jinja.startsWith('{{') && jinja.endsWith('}}')) {
    return `&#123;&#123;${encodeBody(jinja.slice(2, -2))}&#125;&#125;`;
  }
  if (jinja.startsWith('{%') && jinja.endsWith('%}')) {
    return `&#123;%${encodeBody(jinja.slice(2, -2))}%&#125;`;
  }
  if (jinja.startsWith('{#') && jinja.endsWith('#}')) {
    return `&#123;#${encodeBody(jinja.slice(2, -2))}#&#125;`;
  }
  return jinja;
}

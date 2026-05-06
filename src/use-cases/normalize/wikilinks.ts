/**
 * Normalize Python-Markdown wikilinks (`[[Page Name]]`) into standard
 * Markdown links. Without this pass, remark-parse leaves the brackets and
 * the link never resolves.
 *
 * Slug derivation matches the Python-Markdown extension default
 * (`base_url='/'`, `end_url='/'`, lowercase + replace non-`[A-Za-z0-9-]`
 * with `-`, collapse runs, strip ends).
 *
 * Pure, fence-shielded, inline-code-shielded, idempotent (a second pass
 * over `[Label](/slug/)` finds no `[[…]]`).
 *
 * Limitations:
 *   - Only the bracket-only form. `[[name|display]]` is not in Python-
 *     Markdown core, so it's unhandled.
 *   - Links resolve against `/slug/`; per-site `base_url` overrides are
 *     dropped (callers can post-process).
 *   - The `wiki_html_class` attribute is dropped.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const WIKILINK_RE = /\[\[([^\]\n]+?)\]\]/g;

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function rewriteOutsideCode(line: string): string {
  // Walk the line, tracking inline-code spans (delimited by backticks).
  // Only rewrite wikilinks that fall outside code spans.
  let out = '';
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '`') {
      // Find matching closing backtick run.
      let runLen = 1;
      while (line[i + runLen] === '`') runLen += 1;
      const openMarker = '`'.repeat(runLen);
      const closeIdx = line.indexOf(openMarker, i + runLen);
      if (closeIdx === -1) {
        // Unbalanced — bail and treat the rest as plain text (still skip
        // wikilink rewriting to avoid mangling).
        out += line.slice(i);
        return out;
      }
      out += line.slice(i, closeIdx + runLen);
      i = closeIdx + runLen;
      continue;
    }
    // Look ahead for a wikilink.
    if (ch === '[' && line[i + 1] === '[') {
      const close = line.indexOf(']]', i + 2);
      if (close !== -1) {
        const label = line.slice(i + 2, close);
        const slug = slugify(label);
        if (slug !== '') {
          out += `[${label}](/${slug}/)`;
          i = close + 2;
          continue;
        }
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function normalizeWikilinks(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      output.push(line);
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    if (!WIKILINK_RE.test(line)) {
      WIKILINK_RE.lastIndex = 0;
      output.push(line);
      continue;
    }
    WIKILINK_RE.lastIndex = 0;
    output.push(rewriteOutsideCode(line));
  }
  return output.join('\n');
}

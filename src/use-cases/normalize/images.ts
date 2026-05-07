/**
 * Pre-parse normalizer for Material's image attribute extensions.
 *
 * Material uses `attr_list` to attach attributes to images:
 *   ![alt](url){ align=left }
 *   ![alt](url){ width="300" loading=lazy }
 * and a URL-fragment trick to swap images by color scheme
 * (`image.png#only-light`, `#only-dark`).
 *
 * `attr_list` suffixes drop on a CommonMark/remark-gfm round-trip. Rewrite
 * attributed images to raw `<img>` HTML so the attributes survive and
 * `customCss` can style them.
 *
 * Recognized keys:
 *   - `align=left` / `align=right` becomes `class="md-align-{left,right}"`
 *   - `width="N"` and `height="N"` map straight through
 *   - `loading=lazy` (or "lazy") becomes `loading="lazy"`
 *
 * Images whose attr_list contains only unknown keys, and plain images
 * without attr_list, pass through so remark/Astro can still optimize them.
 *
 * Idempotent (output is raw `<img>`) and fence-shielded.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

// Match `![alt](url){ attrs }` on a single line. The attrs blob is optional;
// when absent, the trailing `{...}` group is skipped. alt cannot contain `]`,
// url cannot contain `)`. URL color-scheme markers (`#only-light`,
// `#only-dark`) are kept as part of the url group and stripped below.
const IMAGE_WITH_ATTRS = /^!\[(?<alt>[^\]]*)\]\((?<url>[^)\s]+)\)(?:\{\s*(?<attrs>[^}]*)\})?\s*$/;

const COLOR_SCHEME_HASH = /#only-(?<scheme>light|dark)$/;

interface ParsedAttrs {
  readonly classes: ReadonlyArray<string>;
  readonly htmlAttrs: ReadonlyArray<readonly [string, string]>;
  readonly recognized: boolean;
}

export function normalizeImages(source: string): string {
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
  const match = line.match(IMAGE_WITH_ATTRS);
  if (match === null || match.groups === undefined) {
    return line;
  }
  const { alt = '', url: rawUrl = '', attrs = '' } = match.groups;
  const colorMatch = rawUrl.match(COLOR_SCHEME_HASH);
  const url = colorMatch === null ? rawUrl : rawUrl.replace(COLOR_SCHEME_HASH, '');
  const parsed = parseAttrs(attrs);

  if (!parsed.recognized && colorMatch === null) {
    return line;
  }

  const colorClass = colorMatch?.groups?.scheme;
  const allClasses = [
    ...parsed.classes,
    ...(colorClass !== undefined ? [`only-${colorClass}`] : []),
  ];
  return renderImg(alt, url, { ...parsed, classes: allClasses });
}

const ALIGN_VALUES: ReadonlySet<string> = new Set(['left', 'right']);
const KNOWN_HTML_ATTRS: ReadonlySet<string> = new Set(['width', 'height', 'loading']);

function parseAttrs(blob: string): ParsedAttrs {
  const classes: string[] = [];
  const htmlAttrs: Array<readonly [string, string]> = [];
  let recognized = false;

  for (const token of tokenize(blob)) {
    const eq = token.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = token.slice(0, eq).trim();
    const rawValue = token.slice(eq + 1).trim();
    const value = unquote(rawValue);

    if (key === 'align' && ALIGN_VALUES.has(value)) {
      classes.push(`md-align-${value}`);
      recognized = true;
      continue;
    }
    if (KNOWN_HTML_ATTRS.has(key)) {
      htmlAttrs.push([key, value]);
      recognized = true;
    }
  }

  return { classes, htmlAttrs, recognized };
}

function tokenize(blob: string): ReadonlyArray<string> {
  // Split on whitespace, but keep `key="quoted value"` together.
  const out: string[] = [];
  let buffer = '';
  let inQuote = false;
  for (const ch of blob) {
    if (ch === '"' || ch === "'") {
      inQuote = !inQuote;
      buffer += ch;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      if (buffer.length > 0) {
        out.push(buffer);
        buffer = '';
      }
      continue;
    }
    buffer += ch;
  }
  if (buffer.length > 0) {
    out.push(buffer);
  }
  return out;
}

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    (value.startsWith('"') || value.startsWith("'")) &&
    value[0] === value[value.length - 1]
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function renderImg(alt: string, url: string, parsed: ParsedAttrs): string {
  const parts: string[] = [`<img src="${url}" alt="${alt}"`];
  if (parsed.classes.length > 0) {
    parts.push(` class="${parsed.classes.join(' ')}"`);
  }
  for (const [key, value] of parsed.htmlAttrs) {
    parts.push(` ${key}="${value}"`);
  }
  parts.push('>');
  return parts.join('');
}

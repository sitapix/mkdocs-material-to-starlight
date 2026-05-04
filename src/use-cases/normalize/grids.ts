/**
 * Pre-parse normalizer for Material for MkDocs grid HTML wrappers.
 *
 * Material's grids are written as raw HTML. This normalizer rewrites them
 * into remark-directive container syntax so the downstream AST stage can
 * consume them like any other directive:
 *
 *   <div class="grid cards" markdown>     →    :::card-grid
 *   - card body                                 :::card
 *                                               card body
 *                                               :::
 *   </div>                                     :::
 *
 *   <div class="grid" markdown>            →    :::grid
 *   ...arbitrary blocks...                      ...arbitrary blocks...
 *   </div>                                     :::
 *
 * The card variant unwraps each top-level list item into a :::card directive,
 * UNLESS the card body is a single bare Markdown link — in that case it is
 * promoted directly to `<LinkCard title="..." href="...">` (Starlight native).
 * If the link is followed by a single plain-prose paragraph, that paragraph
 * is captured as the LinkCard's `description=` attribute.
 *
 * The generic variant simply wraps the body in :::grid. Unclosed grid blocks
 * are passed through verbatim — the caller may emit a diagnostic by searching
 * for unconverted `<div class="grid` patterns.
 *
 * Idempotent: directive output contains no `<div class="grid"` substring,
 * so the second pass finds nothing to rewrite. Fence-shielded.
 */

import {
  parseGridOpenLine,
  isGridCloseLine,
  type GridOpening,
} from '../../domain/syntax/grid-line.js';

const FENCE = /^ {0,3}(```|~~~)/;

/**
 * Matches a bare Markdown link as the sole non-blank content of a card body.
 * Captures (1) link text and (2) href.
 *
 * Link text must be plain (no markdown formatting: no `*`, `_`, `:`, `!`, `[`).
 * This avoids promoting cards whose link text would render as literal markdown
 * escapes inside an HTML attribute (e.g. `__Validators__` → bad).
 */
const BARE_LINK_RE = /^\[([^\]_*:!\[]+)\]\(([^)]+)\)\s*$/;

/**
 * Material's icon shortcode (e.g. `:material-clock:`, `:fontawesome-solid-rocket:`,
 * `:octicons-mark-github-16:`). Anchored with optional surrounding whitespace
 * so the same pattern can strip leading and trailing forms.
 */
const ICON_LEADING_RE = /^:[A-Za-z][A-Za-z0-9_-]*:\s*/;
const ICON_TRAILING_RE = /\s*:[A-Za-z][A-Za-z0-9_-]*:$/;

export function normalizeCardGrids(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let i = 0;
  let inFence = false;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (FENCE.test(line)) {
      output.push(line);
      inFence = !inFence;
      i += 1;
      continue;
    }
    if (inFence) {
      output.push(line);
      i += 1;
      continue;
    }
    const opening = parseGridOpenLine(line);
    if (opening === null) {
      output.push(line);
      i += 1;
      continue;
    }
    const block = readGridBody(lines, i + 1);
    if (block === null) {
      output.push(line);
      i += 1;
      continue;
    }
    output.push(...renderGrid(opening, block.bodyLines));
    i = block.nextIndex;
  }

  return output.join('\n');
}

interface GridBody {
  readonly bodyLines: ReadonlyArray<string>;
  readonly nextIndex: number;
}

function readGridBody(
  lines: ReadonlyArray<string>,
  startIndex: number,
): GridBody | null {
  const body: string[] = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (isGridCloseLine(line)) {
      return { bodyLines: body, nextIndex: i + 1 };
    }
    body.push(line);
  }
  return null;
}

function renderGrid(
  opening: GridOpening,
  bodyLines: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const indent = ' '.repeat(opening.indent);
  if (opening.kind === 'cards') {
    return renderCardGrid(indent, bodyLines);
  }
  return [
    `${indent}::::grid`,
    ...bodyLines,
    `${indent}::::`,
  ];
}

function renderCardGrid(
  indent: string,
  bodyLines: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const out: string[] = [`${indent}::::card-grid`];
  const items = splitListItems(bodyLines);
  for (const item of items) {
    // Dedent the card body to remove excess leading whitespace. Without
    // dedenting, lines with 4+ spaces of indent are treated as CommonMark
    // indented code blocks, turning list-of-links card bodies into code fences.
    const dedented = dedentLines(item);
    const linkCard = tryRenderLinkCard(indent, dedented);
    if (linkCard !== null) {
      out.push(...linkCard);
      continue;
    }
    out.push(`${indent}:::card`);
    for (const line of dedented) {
      out.push(line.length === 0 ? '' : `${indent}${line}`);
    }
    out.push(`${indent}:::`);
  }
  out.push(`${indent}::::`);
  return out;
}

/**
 * If the card body's first non-blank line is a bare Markdown link AND either
 * (a) nothing else follows, or
 * (b) a single plain-prose paragraph follows after a blank line,
 * return a `<LinkCard>` JSX self-closing tag (with optional `description=`).
 * Otherwise null.
 *
 * "Plain-prose" rejects descriptions that contain markdown that would not
 * render correctly as a string attribute: links (`[`), inline code (`` ` ``),
 * raw HTML (`<`), block-level structures (lists, headings, quotes, fences,
 * tables, horizontal rules), or multiple paragraphs.
 */
function tryRenderLinkCard(
  indent: string,
  dedented: ReadonlyArray<string>,
): ReadonlyArray<string> | null {
  const linkInfo = matchLeadingBareLink(dedented);
  if (linkInfo === null) return null;
  const { title, href, restStartIndex } = linkInfo;
  const description = extractPlainDescription(dedented, restStartIndex);
  if (description === 'reject') return null;
  const attrs = description === null
    ? `title="${title}" href="${href}"`
    : `title="${title}" href="${href}" description="${escapeAttr(description)}"`;
  return [`${indent}<LinkCard ${attrs} />`];
}

interface LeadingLink {
  readonly title: string;
  readonly href: string;
  readonly restStartIndex: number;
}

/**
 * Locate the first non-blank line and require it — after stripping a leading
 * Material icon, a trailing Material icon, and a single pair of outer
 * emphasis delimiters (`**…**`, `__…__`, `*…*`, `_…_`) — to be a bare
 * Markdown link. Returns the captured title/href and the index of the line
 * *after* the link line, so the caller can scan for a description paragraph.
 */
function matchLeadingBareLink(
  dedented: ReadonlyArray<string>,
): LeadingLink | null {
  for (let i = 0; i < dedented.length; i += 1) {
    const line = (dedented[i] ?? '').trim();
    if (line.length === 0) continue;
    const stripped = stripLinkPresentation(line);
    const m = stripped.match(BARE_LINK_RE);
    if (m === null) return null;
    return {
      title: (m[1] ?? '').trim(),
      href: (m[2] ?? '').trim(),
      restStartIndex: i + 1,
    };
  }
  return null;
}

/**
 * Strip Material-specific decoration around a link line so the underlying
 * link can be matched: leading icon, trailing icon, then a single pair of
 * outer emphasis delimiters. Each strip is conservative: applied at most
 * once and only when the entire wrapper is present, never partially.
 */
function stripLinkPresentation(line: string): string {
  let result = line.replace(ICON_LEADING_RE, '').replace(ICON_TRAILING_RE, '');
  result = result.trim();
  for (const delim of ['**', '__', '*', '_']) {
    if (
      result.length >= delim.length * 2 + 1 &&
      result.startsWith(delim) &&
      result.endsWith(delim)
    ) {
      result = result.slice(delim.length, result.length - delim.length).trim();
      break;
    }
  }
  return result;
}

/**
 * Scan from `start` for an optional plain-prose description paragraph.
 *
 *   null      → no description (only blank lines remain). Caller emits a
 *               LinkCard without a `description=` attribute.
 *   'reject'  → there is content after the link, but it isn't a single
 *               plain-prose paragraph. Caller falls back to `:::card`.
 *   string    → the joined, single-spaced description text.
 */
function extractPlainDescription(
  dedented: ReadonlyArray<string>,
  start: number,
): string | null | 'reject' {
  let i = start;
  while (i < dedented.length && (dedented[i] ?? '').trim().length === 0) {
    i += 1;
  }
  if (i === dedented.length) return null;
  const paragraph: string[] = [];
  while (i < dedented.length && (dedented[i] ?? '').trim().length > 0) {
    const line = (dedented[i] ?? '').trim();
    if (!isPlainProseLine(line)) return 'reject';
    paragraph.push(line);
    i += 1;
  }
  while (i < dedented.length) {
    if ((dedented[i] ?? '').trim().length > 0) return 'reject';
    i += 1;
  }
  return paragraph.join(' ');
}

/**
 * A plain-prose line has no characters that would render incorrectly as a
 * string attribute and no leading block-level markdown markers.
 */
function isPlainProseLine(trimmed: string): boolean {
  if (/[[`<]/.test(trimmed)) return false;
  if (/^[#>|]/.test(trimmed)) return false;
  if (/^([-*+]|\d+\.)\s/.test(trimmed)) return false;
  if (/^(```|~~~)/.test(trimmed)) return false;
  if (/^(-{3,}|={3,}|\*{3,}|_{3,})$/.test(trimmed)) return false;
  return true;
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;');
}

/**
 * Split the body of a `<div class="grid cards">` into per-card line groups.
 *
 * Top-level list items (dash `-`, asterisk `*`, or plus `+`) each become one
 * card. The "top-level" indent is determined by the first list-marker line
 * found; only lines at that exact indent are treated as new-item boundaries.
 * Nested list items (indented deeper) are retained as body content of the
 * enclosing card.
 */
function splitListItems(
  bodyLines: ReadonlyArray<string>,
): ReadonlyArray<ReadonlyArray<string>> {
  const items: string[][] = [];
  let current: string[] | null = null;
  let topIndent: number | null = null;

  for (const line of bodyLines) {
    const markerIndent = listItemIndent(line);
    if (markerIndent !== null) {
      if (topIndent === null) {
        topIndent = markerIndent;
      }
      if (markerIndent === topIndent) {
        current = [stripListMarker(line)];
        items.push(current);
        continue;
      }
    }
    if (current === null) {
      continue;
    }
    current.push(line);
  }
  return items.map(trimTrailingBlanks);
}

/** Returns the number of leading spaces before a list marker, or null. */
function listItemIndent(line: string): number | null {
  const match = line.match(/^( *)[-*+] /);
  return match !== null ? (match[1] ?? '').length : null;
}

function stripListMarker(line: string): string {
  return line.replace(/^(\s*)[-*+] /, '$1');
}

function trimTrailingBlanks(item: ReadonlyArray<string>): ReadonlyArray<string> {
  let end = item.length;
  while (end > 0 && (item[end - 1] ?? '').trim().length === 0) {
    end -= 1;
  }
  return item.slice(0, end);
}

/**
 * Strip the common leading indentation from all non-blank lines so card body
 * content starts at column 0. This prevents 4-space-indented lines from being
 * misread as CommonMark indented code blocks.
 */
function dedentLines(lines: ReadonlyArray<string>): ReadonlyArray<string> {
  const nonBlank = lines.filter((l) => l.trim().length > 0);
  if (nonBlank.length === 0) return lines;
  const minIndent = Math.min(
    ...nonBlank.map((l) => (l.match(/^ */)?.[0] ?? '').length),
  );
  if (minIndent === 0) return lines;
  return lines.map((l) => (l.trim().length === 0 ? '' : l.slice(minIndent)));
}

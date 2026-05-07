/**
 * Pre-parse normalizer for Material grid HTML wrappers.
 *
 * Rewrites raw-HTML grids into remark-directive containers so downstream
 * AST stages can consume them:
 *
 *   <div class="grid cards" markdown>     →    :::card-grid
 *   - card body                                 :::card
 *                                               card body
 *                                               :::
 *   </div>                                     :::
 *
 *   <div class="grid" markdown>            →    :::grid
 *
 * The card variant unwraps each top-level list item into a `:::card`. A
 * card whose body is a single bare Markdown link is promoted to
 * `<LinkCard title="..." href="...">`; a following plain-prose paragraph
 * becomes the `description=` attribute.
 *
 * The generic variant just wraps the body in `:::grid`. Unclosed blocks
 * pass through; callers can emit a diagnostic by searching for any
 * remaining `<div class="grid"`.
 *
 * Idempotent (output has no `<div class="grid"`) and fence-shielded.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';
import {
  type GridOpening,
  isGridCloseLine,
  parseGridOpenLine,
} from '../../domain/syntax/grid-line.js';

/**
 * Matches a bare Markdown link as the sole non-blank content of a card body.
 * Captures (1) link text and (2) href.
 *
 * Link text must be plain (no markdown formatting: no `*`, `_`, `:`, `!`, `[`).
 * This avoids promoting cards whose link text would render as literal markdown
 * escapes inside an HTML attribute (e.g. `__Validators__` → bad).
 */
const BARE_LINK_RE = /^\[([^\]_*:![]+)\]\(([^)]+)\)\s*$/;

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
    if (isFenceLine(line)) {
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
    const rendered = renderGrid(opening, block.bodyLines);
    if (rendered === null) {
      // Card-grid body has no list markers — we can't emit a meaningful
      // `:::card-grid` for it. Pass through the original opener, body,
      // AND closer untouched so structurally-balanced HTML remains so.
      // (griffe's `index.md` uses `<div markdown>` cards instead of `-`
      // list items inside the grid.)
      output.push(line);
      output.push(...block.bodyLines);
      output.push(lines[block.nextIndex - 1] ?? '</div>');
      i = block.nextIndex;
      continue;
    }
    // Emit a blank line before the directive opener if the preceding line
    // is non-blank. CommonMark HTML blocks (e.g. `<div class="result"
    // markdown>`) consume every following non-blank line as raw HTML
    // — without this guard, the `::::card-grid` directive disappears
    // inside the enclosing div and remark-directive never sees it,
    // leaving every `:fontawesome-…` icon shortcode and every `:::card`
    // marker as visible literal text. Real mkdocs-material regression
    // (`reference/grids.md` nested `<div class="result"><div class="grid cards">`).
    const previousLine = output[output.length - 1];
    if (previousLine !== undefined && previousLine.trim().length > 0) {
      output.push('');
    }
    output.push(...rendered);
    // Symmetric guard on the closing side: if the next non-emitted line is
    // non-blank (e.g. `</div>` of an outer wrapper), inject a blank so the
    // directive closer isn't merged into the wrapper's HTML block either.
    const nextLine = lines[block.nextIndex];
    if (nextLine !== undefined && nextLine.trim().length > 0) {
      output.push('');
    }
    i = block.nextIndex;
  }

  return output.join('\n');
}

interface GridBody {
  readonly bodyLines: ReadonlyArray<string>;
  readonly nextIndex: number;
}

function readGridBody(lines: ReadonlyArray<string>, startIndex: number): GridBody | null {
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
): ReadonlyArray<string> | null {
  const indent = ' '.repeat(opening.indent);
  if (opening.kind === 'cards') {
    return renderCardGrid(indent, bodyLines);
  }
  return [`${indent}::::grid`, ...bodyLines, `${indent}::::`];
}

function renderCardGrid(
  indent: string,
  bodyLines: ReadonlyArray<string>,
): ReadonlyArray<string> | null {
  const items = splitListItems(bodyLines);
  // If the body has no list markers, we can't split it into cards. The
  // source likely uses nested `<div markdown>` blocks instead of `-` items
  // (griffe's `index.md` regression). Return null so the caller leaves the
  // entire div block — opener, body, AND closer — untouched. Otherwise we'd
  // emit an empty `::::card-grid` and orphan the inner `</div>` closers.
  if (items.length === 0) {
    return null;
  }
  const out: string[] = [`${indent}::::card-grid`];
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
  const attrs =
    description === null
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
function matchLeadingBareLink(dedented: ReadonlyArray<string>): LeadingLink | null {
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
function splitListItems(bodyLines: ReadonlyArray<string>): ReadonlyArray<ReadonlyArray<string>> {
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
 * Strip leading indentation so a card's body sits at column 0 and is not
 * misread as a CommonMark indented code block.
 *
 * Two-pass dedent:
 *   1. Title strip: dedent every line by the smallest indent in the item.
 *      Flushes the title to column 0 even when nested in an outer container.
 *   2. Body shift: lines still indented deeper than the title (Material's
 *      list-item body alignment) shift down so their minimum indent matches
 *      the title. Relative depth among body lines is preserved so nested
 *      lists keep their structure.
 *
 * Guards against PowerTools `index.md` (title at 0, body at 4 → `<pre>`)
 * and the same shape inside a nested grid where the outer 2-space indent
 * masked the inner 4-space body.
 */
function dedentLines(lines: ReadonlyArray<string>): ReadonlyArray<string> {
  const nonBlank = lines.filter((l) => l.trim().length > 0);
  if (nonBlank.length === 0) return lines;
  const indents = nonBlank.map((l) => (l.match(/^ */)?.[0] ?? '').length);
  const titleIndent = Math.min(...indents);

  // Step 1: title-strip. Flushes the item to column 0 when nested inside
  // an outer container.
  const afterTitle =
    titleIndent === 0
      ? lines.slice()
      : lines.map((l) => (l.trim().length === 0 ? '' : l.slice(titleIndent)));

  // Step 2: body-shift. Body lines = anything deeper than the title. If the
  // body lines all share an indent ≥ 1, slide them down by that amount so
  // they collapse to column 0 (the title's new column).
  const bodyDepths = indents.filter((n) => n > titleIndent).map((n) => n - titleIndent);
  if (bodyDepths.length === 0) return afterTitle;
  const bodyShift = Math.min(...bodyDepths);
  if (bodyShift === 0) return afterTitle;
  return afterTitle.map((l) => {
    if (l.trim().length === 0) return '';
    const lead = (l.match(/^ */)?.[0] ?? '').length;
    // Title-at-column-0 lines stay; deeper lines slide down by bodyShift.
    return lead === 0 ? l : l.slice(bodyShift);
  });
}

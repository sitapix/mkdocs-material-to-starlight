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
 * The card variant unwraps each top-level list item into a :::card directive.
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
    out.push(`${indent}:::card`);
    // Dedent the card body to remove excess leading whitespace. Without
    // dedenting, lines with 4+ spaces of indent are treated as CommonMark
    // indented code blocks, turning list-of-links card bodies into code fences.
    const dedented = dedentLines(item);
    for (const line of dedented) {
      out.push(line.length === 0 ? '' : `${indent}${line}`);
    }
    out.push(`${indent}:::`);
  }
  out.push(`${indent}::::`);
  return out;
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

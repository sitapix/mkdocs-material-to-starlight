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
    for (const line of item) {
      out.push(line.length === 0 ? '' : `${indent}${line}`);
    }
    out.push(`${indent}:::`);
  }
  out.push(`${indent}::::`);
  return out;
}

function splitListItems(
  bodyLines: ReadonlyArray<string>,
): ReadonlyArray<ReadonlyArray<string>> {
  const items: string[][] = [];
  let current: string[] | null = null;
  for (const line of bodyLines) {
    if (isListItemStart(line)) {
      current = [stripListMarker(line)];
      items.push(current);
      continue;
    }
    if (current === null) {
      continue;
    }
    current.push(line);
  }
  return items.map(trimTrailingBlanks);
}

function isListItemStart(line: string): boolean {
  return /^- /.test(line.trimStart());
}

function stripListMarker(line: string): string {
  return line.replace(/^(\s*)- /, '$1');
}

function trimTrailingBlanks(item: ReadonlyArray<string>): ReadonlyArray<string> {
  let end = item.length;
  while (end > 0 && (item[end - 1] ?? '').trim().length === 0) {
    end -= 1;
  }
  return item.slice(0, end);
}

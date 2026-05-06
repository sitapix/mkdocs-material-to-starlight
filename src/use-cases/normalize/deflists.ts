/**
 * Pre-parse normalizer for Python-Markdown's `def_list` extension.
 *
 *   Term
 *   :   Definition body.
 *
 *   Term 2
 *   :   First definition.
 *
 *   :   Second definition for the same term.
 *
 * Starlight has no native deflist rendering and no maintained remark plugin
 * exists (every candidate is pinned to unified 10 / micromark 2). Rewrite
 * to inline `<dl><dt>...</dt><dd>...</dd></dl>` HTML.
 *
 * Recognition: a non-empty line followed by a line whose first non-space
 * char is `:` with at least one space before its content. Subsequent `:`
 * lines belong to the same `<dl>` until a non-deflist line.
 *
 * Idempotent (output has no `:` definition markers) and fence-shielded.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const DEFINITION = /^:[ \t]+(.+)$/;

export function normalizeDefinitionLists(source: string): string {
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

    const block = tryReadDeflistBlock(lines, i);
    if (block === null) {
      output.push(line);
      i += 1;
      continue;
    }

    output.push(...renderDeflistBlock(block));
    i = block.nextIndex;
  }

  return output.join('\n');
}

interface DeflistBlock {
  readonly entries: ReadonlyArray<DeflistEntry>;
  readonly nextIndex: number;
}

interface DeflistEntry {
  readonly term: string;
  readonly definitions: ReadonlyArray<string>;
}

function tryReadDeflistBlock(
  lines: ReadonlyArray<string>,
  start: number,
): DeflistBlock | null {
  const firstEntry = readEntry(lines, start);
  if (firstEntry === null) {
    return null;
  }

  const entries: DeflistEntry[] = [firstEntry.entry];
  let cursor = firstEntry.nextIndex;

  while (cursor < lines.length) {
    const afterBlanks = skipBlankLines(lines, cursor);
    const continuation = readEntry(lines, afterBlanks);
    if (continuation === null) {
      break;
    }
    entries.push(continuation.entry);
    cursor = continuation.nextIndex;
  }

  return { entries, nextIndex: cursor };
}

interface ReadEntry {
  readonly entry: DeflistEntry;
  readonly nextIndex: number;
}

function readEntry(lines: ReadonlyArray<string>, start: number): ReadEntry | null {
  const term = lines[start];
  const first = lines[start + 1];
  if (
    term === undefined ||
    first === undefined ||
    term.trim().length === 0 ||
    DEFINITION.test(term) ||
    !DEFINITION.test(first)
  ) {
    return null;
  }

  const definitions: string[] = [extractDefinition(first)];
  let cursor = start + 2;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined) {
      break;
    }
    if (line.trim().length === 0) {
      const next = lines[cursor + 1];
      if (next !== undefined && DEFINITION.test(next)) {
        definitions.push(extractDefinition(next));
        cursor += 2;
        continue;
      }
      break;
    }
    if (DEFINITION.test(line)) {
      definitions.push(extractDefinition(line));
      cursor += 1;
      continue;
    }
    break;
  }

  return {
    entry: { term: term.trim(), definitions },
    nextIndex: cursor,
  };
}

function extractDefinition(line: string): string {
  const match = line.match(DEFINITION);
  return match === null ? '' : (match[1] ?? '');
}

function skipBlankLines(lines: ReadonlyArray<string>, index: number): number {
  let i = index;
  while (i < lines.length && (lines[i] ?? '').trim().length === 0) {
    i += 1;
  }
  return i;
}

function renderDeflistBlock(block: DeflistBlock): ReadonlyArray<string> {
  const out: string[] = ['<dl>'];
  for (const entry of block.entries) {
    out.push(`<dt>${entry.term}</dt>`);
    for (const definition of entry.definitions) {
      out.push(`<dd>${definition}</dd>`);
    }
  }
  out.push('</dl>');
  return out;
}

/**
 * Pre-parse normalizer: rewrite Material for MkDocs content-tab blocks into
 * remark-directive container syntax.
 *
 * A tab group is a maximal run of `=== "Title"` (or `===!`) openings, separated
 * only by blank lines. Anything else (a paragraph, a heading, an admonition)
 * terminates the group. The exclusive marker on any opening promotes the whole
 * group to exclusive.
 *
 * Each group emits:
 *
 *   :::tabs              (or :::tabs{exclusive})
 *   :::tab[Title 1]
 *   body 1
 *   :::
 *   :::tab[Title 2]
 *   body 2
 *   :::
 *   :::
 *
 * Idempotent — already-normalized output is left alone because the source
 * marker `===` does not appear in the output.
 */

import { parseTabLine, type TabOpening } from '../../domain/syntax/tab-line.js';
import { readIndentedBlock } from '../../domain/syntax/indented-block.js';

const FENCE = /^ {0,3}(```|~~~)/;
const BODY_INDENT = 4;

interface CollectedTab {
  readonly opening: TabOpening;
  readonly body: ReadonlyArray<string>;
}

interface TabGroup {
  readonly tabs: ReadonlyArray<CollectedTab>;
  readonly indent: number;
  readonly exclusive: boolean;
  readonly nextIndex: number;
}

export function normalizeContentTabs(source: string): string {
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

    const opening = parseTabLine(line);
    if (opening === null) {
      output.push(line);
      i += 1;
      continue;
    }

    const group = collectTabGroup(lines, i, opening);
    output.push(...renderGroup(group));
    i = group.nextIndex;
  }

  return output.join('\n');
}

function collectTabGroup(
  lines: ReadonlyArray<string>,
  startIndex: number,
  firstOpening: TabOpening,
): TabGroup {
  const tabs: CollectedTab[] = [];
  let i = startIndex;
  let exclusive = false;

  while (i < lines.length) {
    const opening = parseTabLine(lines[i] ?? '');
    if (opening === null || opening.indent !== firstOpening.indent) {
      break;
    }
    exclusive = exclusive || opening.exclusive;
    const block = readIndentedBlock(lines, i + 1, opening.indent + BODY_INDENT);
    tabs.push({ opening, body: block.bodyLines });
    i = block.nextIndex;
    i = skipSingleBlank(lines, i);
  }

  return { tabs, indent: firstOpening.indent, exclusive, nextIndex: i };
}

function skipSingleBlank(lines: ReadonlyArray<string>, index: number): number {
  if (index >= lines.length) {
    return index;
  }
  const next = lines[index] ?? '';
  return next.trim().length === 0 ? index + 1 : index;
}

function renderGroup(group: TabGroup): ReadonlyArray<string> {
  const indent = ' '.repeat(group.indent);
  const header = group.exclusive ? `${indent}::::tabs{exclusive}` : `${indent}::::tabs`;
  const out: string[] = [header];

  for (const tab of group.tabs) {
    out.push(`${indent}:::tab[${tab.opening.title}]`);
    for (const bodyLine of tab.body) {
      out.push(group.indent === 0 ? bodyLine : indent + bodyLine);
    }
    out.push(`${indent}:::`);
  }

  out.push(`${indent}::::`);
  out.push('');
  return out;
}

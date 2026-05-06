/**
 * Pre-parse normalizer: rewrite Material content-tab blocks into
 * remark-directive containers.
 *
 * A tab group is a maximal run of `=== "Title"` (or `===!`) openings,
 * separated only by blank lines; any other content ends the group. A
 * `===!` marker anywhere in the group promotes the whole group to exclusive.
 *
 * Output:
 *   :::tabs              (or :::tabs{exclusive})
 *   :::tab[Title 1]
 *   body 1
 *   :::
 *   :::tab[Title 2]
 *   body 2
 *   :::
 *   :::
 *
 * Idempotent: emitted output has no `===` markers.
 */

import { parseTabLine, type TabOpening } from '../../domain/syntax/tab-line.js';
import { readIndentedBlock } from '../../domain/syntax/indented-block.js';
import { isFenceLine } from '../../domain/syntax/fence.js';
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
    // Recurse into the body so nested `=== "..."` tab groups also convert.
    // The body is dedented by `readIndentedBlock`, so any nested tabs sit at
    // indent 0 in their own coordinate system — exactly what the recursive
    // pass expects. Real-world Hatch regression: `docs/install.md` nests
    // GUI/CLI tabs inside outer macOS/Windows/Linux tabs; without recursion
    // the inner markers survived as literal `\=== "..."` text.
    const recursedBody = normalizeContentTabs(tab.body.join('\n')).split('\n');
    // The recursive pass appends a trailing blank after each emitted group
    // (see the trailing `''` in `out.push('')` below). Drop one trailing
    // blank if present, so we don't accumulate runaway whitespace when
    // nesting.
    if (recursedBody.length > 0 && recursedBody[recursedBody.length - 1] === '') {
      recursedBody.pop();
    }
    for (const bodyLine of recursedBody) {
      out.push(group.indent === 0 ? bodyLine : indent + bodyLine);
    }
    out.push(`${indent}:::`);
  }

  out.push(`${indent}::::`);
  out.push('');
  return out;
}

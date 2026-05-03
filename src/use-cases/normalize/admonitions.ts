/**
 * Pre-parse normalizer: rewrite Material for MkDocs admonition blocks into
 * remark-directive container syntax. Pure text → text, no AST involved.
 *
 * The normalizer is the only place in the pipeline that handles indentation-
 * sensitive Python-Markdown syntax. Everything downstream consumes well-formed
 * directive markup. By keeping this stage isolated, the rest of the pipeline
 * never has to know that the source was once MkDocs.
 *
 * Idempotency: the normalizer recognizes only the source markers (!!!, ???,
 * ???+). Output that already uses ::: directive syntax is passed through
 * untouched. `normalize(normalize(x)) === normalize(x)`.
 *
 * Fenced-code safety: lines inside triple-backtick fences are passed through
 * verbatim, since `!!! note` inside an example block must not be rewritten.
 */

import {
  parseAdmonitionLine,
  type AdmonitionOpening,
} from '../../domain/syntax/admonition-line.js';
import { readIndentedBlock } from '../../domain/syntax/indented-block.js';

const FENCE = /^ {0,3}(```|~~~)/;
const BODY_INDENT = 4;

/**
 * The number of colons used for admonition directive fences.
 *
 * Must be GREATER than the maximum fence depth used by any directive that may
 * appear inside an admonition body. remark-directive's closing rule terminates
 * ALL open fences with depth ≤ the closing fence depth, so inner directives at
 * depth ≤ N would prematurely close an admonition at the same depth N.
 *
 * Current inner directive depths:
 *   - :::tab / :::card   (depth 3)
 *   - ::::tabs / ::::card-grid (depth 4)
 *
 * Using depth 6 leaves a comfortable gap above the current maximum (4) while
 * staying well within remark-directive's supported range.
 */
export const ADMONITION_FENCE_DEPTH = 6;

export function normalizeAdmonitions(source: string): string {
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

    const opening = parseAdmonitionLine(line);
    if (opening === null) {
      output.push(line);
      i += 1;
      continue;
    }

    const block = readIndentedBlock(
      lines,
      i + 1,
      opening.indent + BODY_INDENT,
    );
    output.push(renderOpening(opening));
    for (const bodyLine of block.bodyLines) {
      output.push(opening.indent === 0 ? bodyLine : ' '.repeat(opening.indent) + bodyLine);
    }
    output.push(`${' '.repeat(opening.indent)}${':'.repeat(ADMONITION_FENCE_DEPTH)}`);
    i = block.nextIndex;
  }

  return output.join('\n');
}

function renderOpening(opening: AdmonitionOpening): string {
  const indent = ' '.repeat(opening.indent);
  const label = opening.title === null ? '' : `[${opening.title}]`;
  const attrs = renderAttributes(opening);
  const fence = ':'.repeat(ADMONITION_FENCE_DEPTH);
  return `${indent}${fence}${opening.type}${label}${attrs}`;
}

function renderAttributes(opening: AdmonitionOpening): string {
  const pairs: string[] = [];
  if (opening.marker === '???') {
    pairs.push('collapsible="closed"');
  } else if (opening.marker === '???+') {
    pairs.push('collapsible="open"');
  }
  if (opening.inline !== null) {
    pairs.push(`inline="${opening.inline === 'end' ? 'end' : 'left'}"`);
  }
  if (opening.hasEmptyTitle) {
    pairs.push('noTitle');
  }
  return pairs.length === 0 ? '' : `{${pairs.join(' ')}}`;
}

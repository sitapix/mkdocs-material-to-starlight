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
import { parseBlocksLine } from '../../domain/syntax/blocks-line.js';

import { isFenceLine } from '../../domain/syntax/fence.js';

const BODY_INDENT = 4;

/**
 * The baseline number of colons used for a leaf admonition directive fence.
 *
 * Must be GREATER than the maximum fence depth used by any non-admonition
 * directive that may appear inside an admonition body. remark-directive's
 * closing rule terminates ALL open fences with depth ≤ the closing fence
 * depth, so inner directives at depth ≤ N would prematurely close an
 * admonition at the same depth N.
 *
 * Current inner directive depths:
 *   - :::tab / :::card   (depth 3)
 *   - ::::tabs / ::::card-grid (depth 4)
 *
 * Using depth 6 leaves a comfortable gap above the current maximum (4) while
 * staying well within remark-directive's supported range.
 *
 * Nested admonitions grow ABOVE this baseline: an admonition that contains
 * other admonitions uses one more colon than the deepest fence in its body.
 */
export const ADMONITION_FENCE_DEPTH = 6;

export function normalizeAdmonitions(source: string): string {
  const lines = source.split('\n');
  return normalizeBlock(lines).output.join('\n');
}

interface NormalizedBlock {
  readonly output: ReadonlyArray<string>;
  /** Maximum admonition fence depth emitted in this block, or 0 if none. */
  readonly maxFenceDepth: number;
}

/**
 * Normalize a contiguous run of lines, recursing into admonition bodies so
 * that nested `!!!` / `???` markers are rewritten too. Operates on lines in
 * their own coordinate system — the caller strips/restores any outer indent.
 */
function normalizeBlock(lines: ReadonlyArray<string>): NormalizedBlock {
  const output: string[] = [];
  let i = 0;
  let inFence = false;
  let maxFenceDepth = 0;

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

    // Recurse into the body before choosing our own fence depth: an
    // admonition that wraps other admonitions must use STRICTLY MORE colons
    // than the deepest inner fence so its closer doesn't terminate them.
    // The body may also contain `///` pymdownx blocks that the blocks
    // normalizer (running later in the pipeline) will emit at depth
    // `ADMONITION_FENCE_DEPTH + max-block-nesting - 1`. Account for that
    // future depth here so we stay strictly above any closer in the body.
    const inner = normalizeBlock(block.bodyLines);
    const futureBlockDepth = projectedBlockDepth(block.bodyLines);
    const fenceDepth = Math.max(
      ADMONITION_FENCE_DEPTH,
      inner.maxFenceDepth + 1,
      futureBlockDepth + 1,
    );

    output.push(renderOpening(opening, fenceDepth));
    const indent = ' '.repeat(opening.indent);
    for (const bodyLine of inner.output) {
      output.push(opening.indent === 0 ? bodyLine : indent + bodyLine);
    }
    output.push(`${indent}${':'.repeat(fenceDepth)}`);

    if (fenceDepth > maxFenceDepth) maxFenceDepth = fenceDepth;
    i = block.nextIndex;
  }

  return { output, maxFenceDepth };
}

function renderOpening(opening: AdmonitionOpening, fenceDepth: number): string {
  const indent = ' '.repeat(opening.indent);
  const label = opening.title === null ? '' : `[${opening.title}]`;
  const attrs = renderAttributes(opening);
  const fence = ':'.repeat(fenceDepth);
  return `${indent}${fence}${opening.type}${label}${attrs}`;
}

/**
 * Estimate the deepest colon-fence the blocks normalizer will emit when it
 * later processes these lines. With the recursive depth-bump in
 * `normalizeBlocks`, a leaf `///` block emits at `ADMONITION_FENCE_DEPTH`
 * and each enclosing block adds one. So the projected depth is
 * `ADMONITION_FENCE_DEPTH + maxNesting - 1` where `maxNesting` is the
 * deepest open `///` stack. Returns 0 when no blocks appear.
 *
 * Skips lines inside fenced code so that example markdown showing `///`
 * usage doesn't inflate the depth.
 */
function projectedBlockDepth(lines: ReadonlyArray<string>): number {
  let inFenceLocal = false;
  let stackDepth = 0;
  let maxNesting = 0;
  for (const line of lines) {
    if (isFenceLine(line)) {
      inFenceLocal = !inFenceLocal;
      continue;
    }
    if (inFenceLocal) continue;
    const parsed = parseBlocksLine(line);
    if (parsed === null) continue;
    if (parsed.kind === 'open') {
      stackDepth += 1;
      if (stackDepth > maxNesting) maxNesting = stackDepth;
    } else if (parsed.kind === 'close' && stackDepth > 0) {
      stackDepth -= 1;
    }
  }
  return maxNesting === 0 ? 0 : ADMONITION_FENCE_DEPTH + maxNesting - 1;
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

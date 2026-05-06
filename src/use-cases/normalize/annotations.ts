/**
 * Pre-parse normalizer for Material annotations.
 *
 *   Lorem ipsum dolor sit amet (1) consectetur adipiscing elit.
 *   { .annotate }
 *
 *   1.  I'm an annotation!
 *
 * Starlight has no popover and no remark plugin handles the positional
 * `(N)` to Nth-list-item binding. Downgrade to Markdown footnotes, which
 * `remark-gfm` renders, preserving the semantic link:
 *
 *   Lorem ipsum dolor sit amet[^anno-N-1] consectetur adipiscing elit.
 *   [^anno-N-1]: I'm an annotation!
 *
 * The `anno-` ID prefix plus a per-block counter keeps IDs unique across
 * multiple annotated blocks.
 *
 * Code-block annotations (`(N)!` inside fenced code) are out of scope here
 * and live in a Phase-3 milestone (language-aware comment stripping).
 *
 * Idempotent (footnote refs/defs are not annotation markers) and fence-safe.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const ANNOTATE_CLASS = /^[ \t]*\{[ \t]*\.annotate[ \t]*\}[ \t]*$/;
const LIST_ITEM = /^(\d+)\.[ \t]+(.+)$/;
const MARKER = /\((\d+)\)/g;

export function normalizeAnnotations(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let blockCounter = 0;
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

    // An { .annotate } class on its own line decorates the immediately
    // preceding paragraph. We search for the directive, then look back for
    // the paragraph and forward for the trailing ordered list.
    if (ANNOTATE_CLASS.test(line)) {
      const annotated = tryRewriteAnnotatedBlock(lines, i, output, blockCounter);
      if (annotated !== null) {
        blockCounter += 1;
        // Replace the already-emitted paragraph in `output` with the rewritten
        // marker version, append footnote definitions, skip ahead past the
        // consumed list.
        output.length = annotated.outputLength;
        output.push(...annotated.lines);
        i = annotated.nextIndex;
        continue;
      }
    }

    output.push(line);
    i += 1;
  }

  return output.join('\n');
}

interface AnnotatedRewrite {
  readonly outputLength: number;
  readonly lines: ReadonlyArray<string>;
  readonly nextIndex: number;
}

function tryRewriteAnnotatedBlock(
  lines: ReadonlyArray<string>,
  annotateLineIndex: number,
  output: ReadonlyArray<string>,
  blockCounter: number,
): AnnotatedRewrite | null {
  // Walk back from output to find the start of the preceding paragraph.
  let paragraphEnd = output.length - 1;
  while (
    paragraphEnd >= 0 &&
    (output[paragraphEnd] ?? '').length === 0
  ) {
    paragraphEnd -= 1;
  }
  if (paragraphEnd < 0) {
    return null;
  }
  let paragraphStart = paragraphEnd;
  while (
    paragraphStart > 0 &&
    (output[paragraphStart - 1] ?? '').length > 0
  ) {
    paragraphStart -= 1;
  }
  const paragraphLines = output.slice(paragraphStart, paragraphEnd + 1);
  const paragraphText = paragraphLines.join('\n');
  if (!MARKER.test(paragraphText)) {
    MARKER.lastIndex = 0;
    return null;
  }
  MARKER.lastIndex = 0;

  // Walk forward from the { .annotate } line to find the trailing ordered list.
  let cursor = annotateLineIndex + 1;
  while (cursor < lines.length && (lines[cursor] ?? '').trim().length === 0) {
    cursor += 1;
  }
  const items: string[] = [];
  while (cursor < lines.length) {
    const next = lines[cursor] ?? '';
    if (next.trim().length === 0) {
      cursor += 1;
      continue;
    }
    const match = next.match(LIST_ITEM);
    if (match === null) {
      break;
    }
    items.push(match[2] ?? '');
    cursor += 1;
  }
  if (items.length === 0) {
    return null;
  }

  const blockId = blockCounter + 1;
  const rewrittenParagraph = paragraphText.replace(
    MARKER,
    (_match, number: string) => `[^anno-${blockId}-${number}]`,
  );
  MARKER.lastIndex = 0;

  const newOutputLines: string[] = [...rewrittenParagraph.split('\n'), ''];
  for (const [index, body] of items.entries()) {
    newOutputLines.push(`[^anno-${blockId}-${index + 1}]: ${body}`);
  }
  newOutputLines.push('');

  return {
    outputLength: paragraphStart,
    lines: newOutputLines,
    nextIndex: cursor,
  };
}

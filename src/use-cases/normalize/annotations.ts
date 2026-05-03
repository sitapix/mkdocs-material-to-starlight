/**
 * Pre-parse normalizer for Material's annotations feature.
 *
 *   Lorem ipsum dolor sit amet (1) consectetur adipiscing elit.
 *   { .annotate }
 *
 *   1.  I'm an annotation!
 *   2.  I'm an annotation as well!
 *
 * Material renders annotations as inline popovers; Starlight has no native
 * popover component, and per `library_audit_20260501.md` no remark plugin
 * implements the positional `(N)` ↔ Nth-list-item binding. The cleanest
 * downgrade that preserves the SEMANTIC link between marker and content is
 * to rewrite annotations as Markdown footnotes, which `remark-gfm` already
 * renders correctly:
 *
 *   Lorem ipsum dolor sit amet[^anno-N-1] consectetur adipiscing elit.
 *
 *   [^anno-N-1]: I'm an annotation!
 *   [^anno-N-2]: I'm an annotation as well!
 *
 * The footnote ID prefix (`anno-`) plus a per-block counter (`N`) keeps the
 * IDs unique across multiple annotated blocks in the same document.
 *
 * Code-block annotations (the `(N)!` form inside fenced code) are NOT
 * handled here yet — they require language-aware comment stripping and live
 * in a Phase-3 milestone.
 *
 * Idempotency: footnote refs/defs are not recognized as annotation markers,
 * so a second pass finds nothing to rewrite. Fence-safe via the standard
 * shielding pattern.
 */

const FENCE = /^ {0,3}(```|~~~)/;
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

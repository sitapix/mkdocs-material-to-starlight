/**
 * Detect snippet references in a Markdown source.
 *
 * Two shapes of snippet exist:
 *
 *   Inline (single line):
 *     --8<-- "path/to/file.ext"
 *
 *   Block (multiple files):
 *     --8<--
 *     path/one.md
 *     ;skip-me.md
 *     path/two.md
 *     --8<--
 *
 * This use-case is detection-only: it locates snippets, parses their refs,
 * and returns a structured list with line numbers. Resolution against the
 * filesystem (`base_path` first-match-wins, line-range slicing, section-marker
 * extraction) is a separate use-case that consumes a `FileSystem` port and
 * lives in `expand-snippets/`.
 *
 * Fenced code is shielded: snippet markers inside ` ``` ` are ignored. This
 * mirrors the admonition and content-tab normalizers' fence safety.
 *
 * Pure: takes a string, returns a list of typed detections.
 */

import {
  parseSnippetLine,
  type SnippetReference,
} from '../../domain/syntax/snippet-line.js';

export type SnippetDetection = InlineDetection | BlockDetection | MalformedDetection;

export interface InlineDetection {
  readonly kind: 'inline';
  readonly line: number;
  readonly reference: SnippetReference;
}

export interface BlockDetection {
  readonly kind: 'block';
  readonly startLine: number;
  readonly endLine: number;
  readonly references: ReadonlyArray<BlockSnippetReference>;
}

export interface BlockSnippetReference {
  readonly path: string;
  readonly skipped: boolean;
}

export interface MalformedDetection {
  readonly kind: 'malformed';
  readonly line: number;
  readonly reason: string;
}

const FENCE = /^ {0,3}(```|~~~)/;
const BLOCK_MARKER = /^ *-+8<-+ *$/;

export function detectSnippets(source: string): ReadonlyArray<SnippetDetection> {
  const lines = source.split('\n');
  const out: SnippetDetection[] = [];
  let i = 0;
  let inFence = false;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (FENCE.test(line)) {
      inFence = !inFence;
      i += 1;
      continue;
    }
    if (inFence) {
      i += 1;
      continue;
    }

    const inline = parseSnippetLine(line);
    if (inline !== null) {
      out.push({ kind: 'inline', line: i, reference: inline });
      i += 1;
      continue;
    }

    if (BLOCK_MARKER.test(line)) {
      const block = readBlock(lines, i);
      out.push(block.detection);
      i = block.nextIndex;
      continue;
    }

    i += 1;
  }

  return out;
}

interface ReadBlockResult {
  readonly detection: SnippetDetection;
  readonly nextIndex: number;
}

function readBlock(lines: ReadonlyArray<string>, startIndex: number): ReadBlockResult {
  const references: BlockSnippetReference[] = [];
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (BLOCK_MARKER.test(line)) {
      return {
        detection: {
          kind: 'block',
          startLine: startIndex,
          endLine: i,
          references,
        },
        nextIndex: i + 1,
      };
    }
    const ref = parseBlockEntry(line);
    if (ref !== null) {
      references.push(ref);
    }
    i += 1;
  }

  return {
    detection: {
      kind: 'malformed',
      line: startIndex,
      reason: 'snippet block opened with --8<-- but no matching close was found',
    },
    nextIndex: i,
  };
}

function parseBlockEntry(line: string): BlockSnippetReference | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith(';')) {
    return { path: trimmed.slice(1), skipped: true };
  }
  return { path: trimmed, skipped: false };
}

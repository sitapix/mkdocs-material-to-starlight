/**
 * Detect snippet references in a Markdown source.
 *
 * Two shapes:
 *   Inline:  --8<-- "path/to/file.ext"
 *   Block:
 *     --8<--
 *     path/one.md
 *     ;skip-me.md
 *     path/two.md
 *     --8<--
 *
 * Detection-only: locates snippets, parses refs, returns a typed list with
 * line numbers. Resolution (`base_path` first-match-wins, line slicing,
 * section markers) lives in `expand-snippets/` behind a FileSystem port.
 *
 * Pure and fence-shielded.
 */

import {
  parseSnippetLine,
  type SnippetReference,
} from '../../domain/syntax/snippet-line.js';

export type SnippetDetection = InlineDetection | BlockDetection | MalformedDetection;

interface InlineDetection {
  readonly kind: 'inline';
  readonly line: number;
  readonly reference: SnippetReference;
}

interface BlockDetection {
  readonly kind: 'block';
  readonly startLine: number;
  readonly endLine: number;
  readonly references: ReadonlyArray<BlockSnippetReference>;
}

interface BlockSnippetReference {
  readonly path: string;
  readonly skipped: boolean;
}

interface MalformedDetection {
  readonly kind: 'malformed';
  readonly line: number;
  readonly reason: string;
}

import { isFenceLine } from '../../domain/syntax/fence.js';

const BLOCK_MARKER = /^ *-+8<-+ *$/;

export function detectSnippets(source: string): ReadonlyArray<SnippetDetection> {
  const lines = source.split('\n');
  const out: SnippetDetection[] = [];
  let i = 0;
  let inFence = false;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (isFenceLine(line)) {
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

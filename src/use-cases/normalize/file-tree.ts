/**
 * Pre-parse normalizer: detect ASCII directory tree code fences and
 * promote them to Starlight's <FileTree> MDX component.
 *
 * DETECTION (conservative):
 *   1. Fenced code block with no language OR language "text" or "tree".
 *   2. >= 3 content lines.
 *   3. >= 2 content lines contain box-drawing chars (├/└/│).
 *   4. First content line is a directory name (ends with "/" or has no
 *      extension and no slashes mid-name, i.e. looks like "my-project/").
 *
 * CONVERSION:
 *   The ASCII tree is parsed into a depth-based nested unordered Markdown
 *   list which <FileTree> renders as a visual directory tree.
 *
 * Idempotent: if <FileTree> already appears in the source, skip.
 * Fence-shielded for nested code fences.
 *
 * Pure function: text -> { text, promoted, diagnostics }. No I/O.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

export interface FileTreeResult {
  readonly text: string;
  readonly promoted: boolean;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

/** Box-drawing characters used in common tree utilities. */
const BOX_DRAWING_RE = /[├└│]/;

/** Opening fence: optional language must be absent, "text", or "tree". */
const FENCE_OPEN_RE = /^( {0,3})(```|~~~)(text|tree)?\s*$/i;
const FENCE_CLOSE_RE = /^( {0,3})(```|~~~)\s*$/;

interface FenceBlock {
  readonly indentStr: string;
  readonly marker: string;
  readonly contentLines: ReadonlyArray<string>;
  /** Start line index (fence open). */
  readonly start: number;
  /** End line index (fence close, inclusive). */
  readonly end: number;
}

function readFenceBlock(
  lines: ReadonlyArray<string>,
  startIdx: number,
): FenceBlock | null {
  const openLine = lines[startIdx] ?? '';
  const openMatch = FENCE_OPEN_RE.exec(openLine);
  if (openMatch === null) return null;

  const indentStr = openMatch[1] ?? '';
  const marker = openMatch[2] ?? '```';
  const content: string[] = [];

  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const closeMatch = FENCE_CLOSE_RE.exec(line);
    if (closeMatch !== null && (closeMatch[2] ?? '') === marker) {
      return { indentStr, marker, contentLines: content, start: startIdx, end: i };
    }
    content.push(line);
  }
  return null;
}

function isAsciiTreeBlock(contentLines: ReadonlyArray<string>): boolean {
  if (contentLines.length < 3) return false;
  const boxLines = contentLines.filter((l) => BOX_DRAWING_RE.test(l));
  if (boxLines.length < 2) return false;
  const firstNonBlank = contentLines.find((l) => l.trim().length > 0);
  if (firstNonBlank === undefined) return false;
  // First line should look like a directory (ends with /) or a plain name.
  const trimmed = firstNonBlank.trim();
  return trimmed.endsWith('/') || (!trimmed.includes('/') && !trimmed.includes(' '));
}

/**
 * Convert ASCII tree lines to a nested unordered Markdown list for <FileTree>.
 *
 * Depth is inferred from the count of box-drawing prefix characters:
 * each ├──, └──, or │ segment corresponds to one level of indentation.
 */
function asciiTreeToList(contentLines: ReadonlyArray<string>): string[] {
  const result: string[] = [];
  for (const rawLine of contentLines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) continue;

    // Count depth from box-drawing prefix characters.
    // Each "│   " or "    " segment = one level. Then ├──/└──/│ itself.
    let depth = 0;
    let rest = rawLine;

    // Count tree structure characters at start
    // Pattern: (│   |    )* then (├── |└── ) then name
    const depthMatch = rawLine.match(/^((?:[│|]   |    )*)/);
    if (depthMatch !== null) {
      // Each "│   " or "    " = 4 chars = one depth level
      depth = Math.floor((depthMatch[1] ?? '').length / 4);
      rest = rawLine.slice((depthMatch[1] ?? '').length);
    }

    // Strip the branch character (├── or └── or │)
    const nameMatch = rest.match(/^(?:[├└]──\s*|│\s*)(.+)$/);
    if (nameMatch !== null) {
      const name = (nameMatch[1] ?? '').trim();
      if (name.length > 0) {
        const indent = '  '.repeat(depth + 1);
        result.push(`${indent}- ${name}`);
      }
    } else {
      // First line (root dir) - no branch char
      const name = trimmed;
      if (name.length > 0) {
        result.push(`- ${name}`);
      }
    }
  }
  return result;
}

export function normalizeFileTrees(source: string): FileTreeResult {
  // Idempotency guard.
  if (source.includes('<FileTree>')) {
    return { text: source, promoted: false, diagnostics: [] };
  }

  const lines = source.split('\n');
  const replacements: Array<{ start: number; end: number; lines: string[] }> = [];
  const diagnostics: Diagnostic[] = [];

  let i = 0;
  while (i < lines.length) {
    const fence = readFenceBlock(lines, i);
    if (fence === null) {
      i += 1;
      continue;
    }

    if (isAsciiTreeBlock(fence.contentLines)) {
      const listLines = asciiTreeToList(fence.contentLines);
      const replacement = [
        '<FileTree>',
        ...listLines,
        '</FileTree>',
      ];
      replacements.push({ start: fence.start, end: fence.end, lines: replacement });
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'code-fence-promoted-to-filetree',
          source: 'normalize/file-tree',
          message: `ASCII directory tree code fence promoted to <FileTree> component.`,
        }),
      );
    }

    i = fence.end + 1;
  }

  if (replacements.length === 0) {
    return { text: source, promoted: false, diagnostics: [] };
  }

  const outLines = [...lines];
  for (const r of [...replacements].reverse()) {
    outLines.splice(r.start, r.end - r.start + 1, ...r.lines);
  }

  return { text: outLines.join('\n'), promoted: true, diagnostics };
}

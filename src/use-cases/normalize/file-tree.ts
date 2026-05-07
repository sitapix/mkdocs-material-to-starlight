/**
 * Pre-parse normalizer: detect ASCII directory-tree code fences and promote
 * them to Starlight's `<FileTree>` MDX component.
 *
 * Detection (conservative):
 *   1. Fenced code block with no language or language `text` / `tree`.
 *   2. >= 3 content lines, >= 2 of them with box-drawing chars (├ └ │).
 *   3. First content line is a directory name (`my-project/` or no
 *      extension/slashes mid-name).
 *
 * Conversion: parse the ASCII tree into a depth-based nested unordered
 * Markdown list, which `<FileTree>` renders as a directory tree.
 *
 * Idempotent (skips when `<FileTree>` already appears) and fence-shielded
 * for nested fences. Pure.
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
/** ANY fence open (with or without language) — used to skip over non-tree fences. */
const ANY_FENCE_OPEN_RE = /^( {0,3})(```+|~~~+)([^\n`]*)$/;

interface FenceBlock {
  readonly indentStr: string;
  readonly marker: string;
  readonly contentLines: ReadonlyArray<string>;
  /** Start line index (fence open). */
  readonly start: number;
  /** End line index (fence close, inclusive). */
  readonly end: number;
}

function readFenceBlock(lines: ReadonlyArray<string>, startIdx: number): FenceBlock | null {
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

/**
 * Filename/dirname character set: ASCII letters, digits, and a small set of
 * filesystem-safe punctuation. Crucially excludes markdown formatting (`*`,
 * `_`, `` ` ``), prose punctuation (`:`, `,`, `;`, `?`, `!`), and HTML
 * (`<`, `>`, `=`, `"`). A real directory listing's first line is overwhelmingly
 * just `name/` or `name.ext`; anything else is more likely to be prose.
 */
const TREE_ROOT_RE = /^[A-Za-z0-9_.\-/]+\/?$/;

function isAsciiTreeBlock(contentLines: ReadonlyArray<string>): boolean {
  if (contentLines.length < 3) return false;
  const boxLines = contentLines.filter((l) => BOX_DRAWING_RE.test(l));
  if (boxLines.length < 2) return false;
  const firstNonBlank = contentLines.find((l) => l.trim().length > 0);
  if (firstNonBlank === undefined) return false;
  // First line must look like a real filesystem entry — letters/digits/
  // ./_-/ only, optional trailing slash. Rejects `**Note**:`, `$ command`,
  // headings, and other prose tokens that happen to lack spaces or slashes.
  return TREE_ROOT_RE.test(firstNonBlank.trim());
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
    const depthMatch = rawLine.match(/^((?:[│|] {3}| {4})*)/);
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
    const line = lines[i] ?? '';

    // If this line opens a fence whose language is NOT promotion-eligible
    // (anything except empty, "text", or "tree"), skip the entire block. The
    // alternative — letting the loop fall through — would let
    // `readFenceBlock` mistake the block's CLOSING fence for an opening of a
    // no-language fence and swallow everything up to the next fence. (Real
    // fastapi/index.md regression: the close of a Python block was taken as
    // the open of a tree fence and absorbed an entire console block.)
    const anyOpen = ANY_FENCE_OPEN_RE.exec(line);
    if (anyOpen !== null) {
      const marker = anyOpen[2] ?? '';
      const lang = (anyOpen[3] ?? '').trim();
      const isPromotionCandidate = lang.length === 0 || /^(text|tree)$/i.test(lang);
      if (!isPromotionCandidate) {
        const markerChar = marker[0];
        const minLen = marker.length;
        let j = i + 1;
        while (j < lines.length) {
          const closeMatch = (lines[j] ?? '').match(/^( {0,3})(`+|~+)\s*$/);
          if (
            closeMatch !== null &&
            (closeMatch[2] ?? '')[0] === markerChar &&
            (closeMatch[2] ?? '').length >= minLen
          ) {
            break;
          }
          j += 1;
        }
        i = j + 1;
        continue;
      }
    }

    const fence = readFenceBlock(lines, i);
    if (fence === null) {
      i += 1;
      continue;
    }

    if (isAsciiTreeBlock(fence.contentLines)) {
      const listLines = asciiTreeToList(fence.contentLines);
      // MDX treats `<FileTree>` as inline JSX when it lands inside a paragraph
      // context. Real-world break (pyodide-mkdocs-theme): file-tree fences
      // are wrapped in Jinja `{% raw %}` markers without blank-line padding,
      // so after we promote the fence the `<FileTree>` opener sits adjacent
      // to inline-coded Jinja text. MDX then expects a closing tag inside the
      // paragraph and raises "Expected a closing tag for <FileTree> before
      // end of paragraph". Pad with blank lines when the immediately
      // adjacent source line is non-blank — this forces the JSX into a
      // block context. We do not add a blank when one already exists, so the
      // result remains idempotent.
      const before = lines[fence.start - 1];
      const after = lines[fence.end + 1];
      const padBefore = fence.start > 0 && before !== undefined && before !== '';
      const padAfter = after !== undefined && after !== '';
      const replacement: string[] = [];
      if (padBefore) replacement.push('');
      replacement.push('<FileTree>');
      replacement.push(...listLines);
      replacement.push('</FileTree>');
      if (padAfter) replacement.push('');
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

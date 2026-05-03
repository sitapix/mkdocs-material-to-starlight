/**
 * Expand `pymdownx.snippets` references in-place.
 *
 * Composes:
 *   detectSnippets       — locate inline `--8<-- "x"` references
 *   resolveSnippet       — find the file in base_path order
 *   recursive expansion  — snippets within snippets, with cycle detection
 *
 * Behavior:
 *   - Inline snippets are replaced with their resolved content.
 *   - A direct or indirect cycle is broken by emitting a `snippet-cycle`
 *     diagnostic and leaving the offending marker in place.
 *   - Depth-exceeded conditions emit a `snippet-depth-exceeded` diagnostic.
 *   - Snippet-not-found emits a warning diagnostic and leaves the marker in
 *     place so the source remains valid Markdown.
 *
 * Idempotency: once a snippet is inlined, the resulting text contains the
 * inlined body and no `--8<--` marker for that path. Re-running the expander
 * on the output is a no-op for that snippet.
 *
 * Block-form snippets (multi-file `--8<--` ... `--8<--`) are also handled.
 * Each non-skipped (`;`-prefix) entry in the block is resolved in order and
 * the resolved bodies are concatenated, replacing the entire block in-place.
 * Unclosed blocks emit a `snippet-malformed` diagnostic.
 */

import { detectSnippets, type SnippetDetection } from '../normalize/snippets.js';
import { resolveSnippet } from './resolve.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { FileSystem } from '../../domain/ports/file-system.js';

export interface ExpandInput {
  readonly source: string;
  readonly basePaths: ReadonlyArray<string>;
  readonly fs: FileSystem;
  readonly maxDepth?: number;
  /**
   * When true, common leading whitespace is removed from every line of an
   * extracted line-range or named section. Mirrors PyMdown's
   * `dedent_subsections` option. Default false.
   */
  readonly dedentSubsections?: boolean;
}

export interface ExpandOutput {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

const DEFAULT_MAX_DEPTH = 8;
const SOURCE = 'mkdocs-to-starlight';

export async function expandSnippets(input: ExpandInput): Promise<ExpandOutput> {
  const diagnostics: Diagnostic[] = [];
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH;
  const dedent = input.dedentSubsections === true;
  const text = await expandWithStack(
    input.source,
    input.basePaths,
    input.fs,
    new Set<string>(),
    0,
    maxDepth,
    diagnostics,
    dedent,
  );
  return { text, diagnostics };
}

async function expandWithStack(
  source: string,
  basePaths: ReadonlyArray<string>,
  fs: FileSystem,
  stack: ReadonlySet<string>,
  depth: number,
  maxDepth: number,
  diagnostics: Diagnostic[],
  dedent: boolean,
): Promise<string> {
  if (depth > maxDepth) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'snippet-depth-exceeded',
        message: `snippet recursion exceeded depth limit of ${String(maxDepth)}`,
        source: SOURCE,
      }),
    );
    return source;
  }

  const detections = detectSnippets(source);
  if (detections.length === 0) {
    return source;
  }

  return applyDetections(
    source,
    detections,
    basePaths,
    fs,
    stack,
    depth,
    maxDepth,
    diagnostics,
    dedent,
  );
}

async function applyDetections(
  source: string,
  detections: ReadonlyArray<SnippetDetection>,
  basePaths: ReadonlyArray<string>,
  fs: FileSystem,
  stack: ReadonlySet<string>,
  depth: number,
  maxDepth: number,
  diagnostics: Diagnostic[],
  dedent: boolean,
): Promise<string> {
  const lines = source.split('\n');
  const out: string[] = [];
  let cursor = 0;
  for (const detection of detections) {
    if (detection.kind === 'inline') {
      flushUntil(lines, cursor, detection.line, out);
      const replacement = await expandOne(
        detection.reference.path,
        detection.line,
        basePaths,
        fs,
        stack,
        depth,
        maxDepth,
        diagnostics,
        dedent,
        {
          lineRanges: detection.reference.lineRanges,
          section: detection.reference.section,
        },
      );
      out.push(replacement ?? lines[detection.line] ?? '');
      cursor = detection.line + 1;
      continue;
    }
    if (detection.kind === 'block') {
      flushUntil(lines, cursor, detection.startLine, out);
      const blockText = await expandBlock(
        detection,
        basePaths,
        fs,
        stack,
        depth,
        maxDepth,
        diagnostics,
        dedent,
      );
      out.push(blockText);
      cursor = detection.endLine + 1;
      continue;
    }
    flushUntil(lines, cursor, detection.line, out);
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'snippet-malformed',
        message: detection.reason,
        source: SOURCE,
        place: { line: detection.line + 1, column: 1 },
      }),
    );
    out.push(lines[detection.line] ?? '');
    cursor = detection.line + 1;
  }
  flushUntil(lines, cursor, lines.length, out);
  return out.join('\n');
}

function flushUntil(
  lines: ReadonlyArray<string>,
  from: number,
  toExclusive: number,
  out: string[],
): void {
  for (let i = from; i < toExclusive; i += 1) {
    out.push(lines[i] ?? '');
  }
}

async function expandBlock(
  detection: { references: ReadonlyArray<{ path: string; skipped: boolean }>; startLine: number },
  basePaths: ReadonlyArray<string>,
  fs: FileSystem,
  stack: ReadonlySet<string>,
  depth: number,
  maxDepth: number,
  diagnostics: Diagnostic[],
  dedent: boolean,
): Promise<string> {
  const bodies: string[] = [];
  for (const ref of detection.references) {
    if (ref.skipped) {
      continue;
    }
    const expanded = await expandOne(
      ref.path,
      detection.startLine,
      basePaths,
      fs,
      stack,
      depth,
      maxDepth,
      diagnostics,
      dedent,
    );
    if (expanded !== null) {
      bodies.push(expanded);
    }
  }
  return bodies.join('\n');
}

interface SliceOptions {
  readonly lineRanges: ReadonlyArray<{
    readonly start: number | null;
    readonly end: number | null;
  }> | null;
  readonly section: string | null;
}

async function expandOne(
  relativePath: string,
  line: number,
  basePaths: ReadonlyArray<string>,
  fs: FileSystem,
  stack: ReadonlySet<string>,
  depth: number,
  maxDepth: number,
  diagnostics: Diagnostic[],
  dedent: boolean,
  slice: SliceOptions = { lineRanges: null, section: null },
): Promise<string | null> {
  // PyMdown supports `--8<-- "https://…"` URL snippets via `url_download`.
  // We don't fetch remote content (SSRF-style risk per PyMdown's own docs)
  // and surface a diagnostic instead.
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(relativePath)) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'snippet-url-not-supported',
        message: `URL-form snippet "${relativePath}" is not supported (security: SSRF risk).`,
        source: SOURCE,
        place: { line: line + 1, column: 1 },
      }),
    );
    return null;
  }
  const resolved = await resolveSnippet({ relativePath, basePaths, fs });
  if (!resolved.ok) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'snippet-not-found',
        message: `snippet "${relativePath}" not found in base paths; searched ${resolved.error.searched.join(', ')}`,
        source: SOURCE,
        place: { line: line + 1, column: 1 },
      }),
    );
    return null;
  }

  if (stack.has(resolved.value.absolutePath)) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'snippet-cycle',
        message: `snippet cycle detected at "${resolved.value.absolutePath}"`,
        source: SOURCE,
        place: { line: line + 1, column: 1 },
      }),
    );
    return null;
  }

  const sliced = applySlice(
    resolved.value.content,
    relativePath,
    line,
    slice,
    diagnostics,
  );
  if (sliced === null) {
    return null;
  }

  // PyMdown `dedent_subsections`: only applies when an actual sub-extraction
  // was performed (line range OR section), not for full-file inclusion.
  const wasSubExtraction = slice.section !== null || slice.lineRanges !== null;
  const finalText = dedent && wasSubExtraction ? dedentBlock(sliced) : sliced;

  const nextStack = new Set(stack);
  nextStack.add(resolved.value.absolutePath);
  return expandWithStack(
    finalText,
    basePaths,
    fs,
    nextStack,
    depth + 1,
    maxDepth,
    diagnostics,
    dedent,
  );
}

function dedentBlock(text: string): string {
  const lines = text.split('\n');
  let minIndent: number | null = null;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const indent = line.length - line.trimStart().length;
    minIndent = minIndent === null ? indent : Math.min(minIndent, indent);
  }
  if (minIndent === null || minIndent === 0) return text;
  return lines
    .map((line) => (line.length >= minIndent ? line.slice(minIndent) : line))
    .join('\n');
}

const SECTION_START = /^.*--8<--\s+\[start:([A-Za-z0-9_-]+)\]\s*$/;
const SECTION_END = /^.*--8<--\s+\[end:([A-Za-z0-9_-]+)\]\s*$/;

function applySlice(
  content: string,
  relativePath: string,
  line: number,
  slice: SliceOptions,
  diagnostics: Diagnostic[],
): string | null {
  if (slice.section !== null) {
    return extractSection(content, relativePath, line, slice.section, diagnostics);
  }
  if (slice.lineRanges !== null) {
    return sliceLineRanges(content, slice.lineRanges);
  }
  return content;
}

function sliceLineRanges(
  content: string,
  ranges: ReadonlyArray<{ readonly start: number | null; readonly end: number | null }>,
): string {
  const lines = content.split('\n');
  // Trailing newline produces a trailing empty element from split — drop it
  // so we don't slice into phantom content.
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  const total = lines.length;
  const out: string[] = [];
  for (const range of ranges) {
    // PyMdown semantics:
    //   - 0 clamps to 1
    //   - negative indexes are end-relative: -1 = last line
    //   - missing start → 1; missing end → EOF
    const startResolved = resolveBound(range.start, total, /*defaultIfNull*/ 1);
    const endResolved = resolveBound(range.end, total, /*defaultIfNull*/ total);
    const startIdx = Math.max(0, startResolved - 1);
    const endIdx = Math.max(startIdx, Math.min(total, endResolved));
    out.push(lines.slice(startIdx, endIdx).join('\n'));
  }
  // Concatenate without inserting separators (PyMdown semantics: "No
  // additional separators (empty lines or otherwise) are inserted between
  // selections, they are inserted exactly as specified").
  return out.join('\n');
}

function resolveBound(
  raw: number | null,
  total: number,
  defaultIfNull: number,
): number {
  if (raw === null) return defaultIfNull;
  if (raw === 0) return 1; // PyMdown: "If 0 is used it will be clamped to 1."
  if (raw < 0) return Math.max(1, total + raw + 1);
  return raw;
}

function extractSection(
  content: string,
  relativePath: string,
  line: number,
  section: string,
  diagnostics: Diagnostic[],
): string | null {
  const lines = content.split('\n');
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const startMatch = lines[i]!.match(SECTION_START);
    if (startMatch !== null && startMatch[1] === section) {
      startIdx = i + 1;
      continue;
    }
    const endMatch = lines[i]!.match(SECTION_END);
    if (endMatch !== null && endMatch[1] === section) {
      endIdx = i;
      break;
    }
  }
  if (startIdx === -1 || endIdx === -1) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'snippet-section-not-found',
        message: `snippet section "${section}" not found in "${relativePath}"`,
        source: SOURCE,
        place: { line: line + 1, column: 1 },
      }),
    );
    return null;
  }
  return lines.slice(startIdx, endIdx).join('\n');
}


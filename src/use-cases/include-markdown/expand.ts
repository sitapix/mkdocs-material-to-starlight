/**
 * Expand `mkdocs-include-markdown-plugin` directives in-place.
 *
 * Recognized:
 *   {% include "path" %}
 *   {% include-markdown "path" %}
 *   {% include-markdown "path" start="<!--s-->" end="<!--e-->" %}
 * The multi-line `{% ... %}` block form is also accepted.
 *
 * Behavior:
 *   - Reads the file via the FileSystem port and inserts its content.
 *   - `start=` / `end=` extract the substring between the markers
 *     (exclusive). A missing marker emits a diagnostic and leaves content
 *     unchanged.
 *   - Unsupported options (heading-offset, dedent, rewrite-relative-urls,
 *     comments, preserve-includer-indent, trailing-newlines) emit one
 *     diagnostic per directive listing the ignored keys; expansion still
 *     proceeds.
 *   - Recursion goes up to depth 8. Cycles emit a diagnostic and leave
 *     the partial output in place.
 *   - File-not-found leaves the directive verbatim.
 *
 * Idempotent: expanded output has no `{% include %}` marker for that path.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { safeResolveWithin } from '../safety/safe-resolve.js';

const SOURCE = 'include-markdown';
const DEFAULT_MAX_DEPTH = 8;

const DIRECTIVE_RE =
  /\{%\s*(include-markdown|include)\s+"([^"]+)"((?:\s+[a-zA-Z][a-zA-Z0-9_-]*=(?:"[^"]*"|[^\s%]+))*)\s*%\}/gm;
const OPTION_RE = /([a-zA-Z][a-zA-Z0-9_-]*)=(?:"([^"]*)"|([^\s%]+))/g;

const SUPPORTED_OPTIONS: ReadonlySet<string> = new Set(['start', 'end']);

export interface ExpandIncludeMarkdownInput {
  readonly source: string;
  readonly docsDir: string;
  readonly fs: FileSystem;
  readonly maxDepth?: number;
}

export interface ExpandIncludeMarkdownOutput {
  readonly text: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export async function expandIncludeMarkdown(
  input: ExpandIncludeMarkdownInput,
): Promise<ExpandIncludeMarkdownOutput> {
  const diagnostics: Diagnostic[] = [];
  const text = await expandWithStack(
    input.source,
    input.docsDir,
    input.fs,
    new Set<string>(),
    0,
    input.maxDepth ?? DEFAULT_MAX_DEPTH,
    diagnostics,
  );
  return { text, diagnostics };
}

async function expandWithStack(
  source: string,
  docsDir: string,
  fs: FileSystem,
  stack: ReadonlySet<string>,
  depth: number,
  maxDepth: number,
  diagnostics: Diagnostic[],
): Promise<string> {
  if (depth > maxDepth) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'plugin-include-markdown-not-found',
        message: `include-markdown recursion exceeded depth limit of ${String(maxDepth)}`,
        source: SOURCE,
      }),
    );
    return source;
  }

  const matches = [...source.matchAll(DIRECTIVE_RE)];
  if (matches.length === 0) {
    return source;
  }

  let cursor = 0;
  const parts: string[] = [];
  for (const match of matches) {
    const start = match.index ?? 0;
    parts.push(source.slice(cursor, start));
    parts.push(await renderDirective(match, docsDir, fs, stack, depth, maxDepth, diagnostics));
    cursor = start + match[0].length;
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}

async function renderDirective(
  match: RegExpMatchArray,
  docsDir: string,
  fs: FileSystem,
  stack: ReadonlySet<string>,
  depth: number,
  maxDepth: number,
  diagnostics: Diagnostic[],
): Promise<string> {
  const directiveText = match[0];
  const path = match[2] ?? '';
  const options = parseOptions(match[3] ?? '');
  const resolvedPath = joinPath(docsDir, path);

  if (stack.has(resolvedPath)) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'plugin-include-markdown-not-found',
        message: `include cycle detected at "${path}"; aborting expansion to prevent infinite recursion.`,
        source: SOURCE,
      }),
    );
    return directiveText;
  }

  // Reject paths that escape the docs directory after symlink resolution. The
  // include directive comes from user-controlled source markdown, so a
  // symlink in docs/ pointing at /etc/passwd would otherwise be silently
  // dereferenced and inlined into the converted output.
  const safe = await safeResolveWithin(docsDir, resolvedPath, fs);
  if (!safe.ok && safe.error.code === 'path-escapes-base') {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'path-escapes-base',
        message: `include-markdown path "${path}" resolves outside the docs directory after symlink resolution; rejected. ${safe.error.message}`,
        source: SOURCE,
      }),
    );
    return directiveText;
  }
  // For non-existent paths or other realpath failures, fall through — the
  // existing read-error path emits `plugin-include-markdown-not-found`.

  const read = await fs.readText(resolvedPath);
  if (!read.ok) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'plugin-include-markdown-not-found',
        message: `include-markdown could not resolve "${path}" (looked at ${resolvedPath}).`,
        source: SOURCE,
      }),
    );
    return directiveText;
  }

  const ignored = [...options.keys()].filter((k) => !SUPPORTED_OPTIONS.has(k));
  if (ignored.length > 0) {
    diagnostics.push(
      createDiagnostic({
        severity: 'warning',
        ruleId: 'plugin-include-markdown-unsupported-option',
        message: `include-markdown option(s) ignored for "${path}": ${ignored.join(', ')}.`,
        source: SOURCE,
      }),
    );
  }

  const sliced = sliceByMarkers(read.value, options, path, diagnostics);
  const recursedStack = new Set(stack).add(resolvedPath);
  return expandWithStack(sliced, docsDir, fs, recursedStack, depth + 1, maxDepth, diagnostics);
}

function sliceByMarkers(
  body: string,
  options: ReadonlyMap<string, string>,
  path: string,
  diagnostics: Diagnostic[],
): string {
  const startMarker = options.get('start');
  const endMarker = options.get('end');
  let result = body;
  if (startMarker !== undefined) {
    const idx = result.indexOf(startMarker);
    if (idx === -1) {
      diagnostics.push(
        createDiagnostic({
          severity: 'warning',
          ruleId: 'plugin-include-markdown-marker-not-found',
          message: `include-markdown start marker "${startMarker}" not found in "${path}"; including full file.`,
          source: SOURCE,
        }),
      );
    } else {
      result = result.slice(idx + startMarker.length);
    }
  }
  if (endMarker !== undefined) {
    const idx = result.indexOf(endMarker);
    if (idx === -1) {
      diagnostics.push(
        createDiagnostic({
          severity: 'warning',
          ruleId: 'plugin-include-markdown-marker-not-found',
          message: `include-markdown end marker "${endMarker}" not found in "${path}"; including content from start marker onwards.`,
          source: SOURCE,
        }),
      );
    } else {
      result = result.slice(0, idx);
    }
  }
  return result;
}

function parseOptions(raw: string): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const m of raw.matchAll(OPTION_RE)) {
    const key = m[1] ?? '';
    const value = m[2] !== undefined ? m[2] : (m[3] ?? '');
    out.set(key, value);
  }
  return out;
}

function joinPath(base: string, rel: string): string {
  if (base.length === 0) return rel;
  return base.endsWith('/') ? `${base}${rel}` : `${base}/${rel}`;
}

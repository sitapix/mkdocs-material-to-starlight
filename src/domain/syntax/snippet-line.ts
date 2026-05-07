/**
 * Parse a single line as a PyMdown `pymdownx.snippets` inline reference.
 *
 * Shapes (PyMdown 10.21):
 *   --8<-- "path/to/file.ext"      basic
 *   --8<-- "file.md:3"             start line
 *   --8<-- "file.md::3"            end-only range (lines 1..3)
 *   --8<-- "file.md:4:6"           start:end
 *   --8<-- "file.md:1:3,5:6"       comma-separated selections
 *   --8<-- "file.md:-3:-1"         negative indexes (last 3 lines)
 *   --8<-- "file.md:section_name"  named section
 *   --8<-- ";file.md"              skip prefix
 *
 * Scissor lengths are flexible (`-8<-` through `----8<-------`), matching
 * the upstream parser. Unquoted and empty paths are rejected.
 *
 * Block-form snippets are out of scope here; a separate block detector
 * handles them. Pure.
 */

interface SnippetLineRange {
  /** 1-based start line. Negative values are end-relative (resolved later). */
  readonly start: number | null;
  /** 1-based end line, inclusive. Null means "to EOF". */
  readonly end: number | null;
}

export interface SnippetReference {
  readonly kind: 'inline';
  readonly path: string;
  readonly indent: number;
  /**
   * Ordered list of line ranges to extract. Single-range form (`:3:6`) is a
   * one-element array; multi-select form (`:1:3,5:6`) is multiple. Null
   * means no slicing — include the entire file.
   */
  readonly lineRanges: ReadonlyArray<SnippetLineRange> | null;
  readonly section: string | null;
  readonly skipped: boolean;
}

const PATTERN = /^(?<indent> *)-+8<-+ +"(?<spec>[^"]+)" *$/;
const SINGLE_RANGE = /^(-?\d+)?(?::(-?\d+)?)?$/;

export function parseSnippetLine(line: string): SnippetReference | null {
  const match = line.match(PATTERN);
  if (match === null || match.groups === undefined) {
    return null;
  }

  const indent = (match.groups.indent ?? '').length;
  const spec = match.groups.spec ?? '';
  const skipped = spec.startsWith(';');
  const cleaned = skipped ? spec.slice(1) : spec;

  return parsePathSpec(cleaned, indent, skipped);
}

function parsePathSpec(spec: string, indent: number, skipped: boolean): SnippetReference | null {
  // URL-form snippets (`--8<-- "https://…"`) — preserve the full URL as the
  // path so the expander can surface a security diagnostic. Without this
  // branch, the URL's leading `:` would be parsed as a section/range
  // separator and the path would collapse to `https`.
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(spec)) {
    return {
      kind: 'inline',
      path: spec,
      indent,
      lineRanges: null,
      section: null,
      skipped,
    };
  }
  const colon = spec.indexOf(':');
  if (colon === -1) {
    return spec.length === 0
      ? null
      : {
          kind: 'inline',
          path: spec,
          indent,
          lineRanges: null,
          section: null,
          skipped,
        };
  }

  const path = spec.slice(0, colon);
  const rest = spec.slice(colon + 1);
  if (path.length === 0) {
    return null;
  }

  const ranges = parseRangeSpec(rest);
  if (ranges !== null) {
    return {
      kind: 'inline',
      path,
      indent,
      lineRanges: ranges,
      section: null,
      skipped,
    };
  }

  return {
    kind: 'inline',
    path,
    indent,
    lineRanges: null,
    section: rest,
    skipped,
  };
}

function parseRangeSpec(text: string): ReadonlyArray<SnippetLineRange> | null {
  // Multi-range comma-separated form: "1:3,5:6". Each segment must be a valid
  // single-range; if ANY segment fails to parse, the whole thing is treated
  // as a section name (returns null).
  const segments = text.split(',');
  const ranges: SnippetLineRange[] = [];
  for (const segment of segments) {
    const range = parseSingleRange(segment.trim());
    if (range === null) return null;
    ranges.push(range);
  }
  return ranges;
}

function parseSingleRange(text: string): SnippetLineRange | null {
  const match = text.match(SINGLE_RANGE);
  if (match === null) return null;
  const startStr = match[1];
  const endStr = match[2];
  // Both empty → not a range (e.g. `:` with no digits).
  if (startStr === undefined && endStr === undefined && !text.includes(':')) {
    return null;
  }
  const start = startStr === undefined || startStr === '' ? null : Number(startStr);
  const end = endStr === undefined || endStr === '' ? null : Number(endStr);
  // Pure colon `:` with neither number is degenerate.
  if (start === null && end === null) return null;
  return { start, end };
}

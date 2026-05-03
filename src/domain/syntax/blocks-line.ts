/**
 * Parse a single line as a `pymdownx.blocks.*` opening or closing.
 *
 * Material for MkDocs is migrating from legacy syntax (`!!! note`, `=== "Tab"`,
 * `??? details`) to the unified `pymdownx.blocks.*` family, which uses 3+ slash
 * fences:
 *
 *   /// admonition | Title
 *       type: note
 *   ---
 *   body
 *   ///
 *
 * Or, more commonly, a named-shortcut form recognized by `blocks.admonition`,
 * `blocks.details`, `blocks.tab`, `blocks.definition`, `blocks.html`,
 * `blocks.caption`:
 *
 *   /// note | Title
 *   body
 *   ///
 *
 * Like fenced code blocks, the opener and matching closer must use the same
 * number of slashes (>= 3). Returns `null` when the line is not a recognized
 * blocks fence; pure value transformation, no side effects.
 */

export interface BlocksOpening {
  readonly kind: 'open';
  readonly name: string;
  readonly title: string | null;
  readonly fenceLength: number;
  readonly indent: number;
}

export interface BlocksClosing {
  readonly kind: 'close';
  readonly fenceLength: number;
  readonly indent: number;
}

export type BlocksLine = BlocksOpening | BlocksClosing | null;

const OPEN_PATTERN =
  /^(?<indent> *)(?<fence>\/{3,}) +(?<name>[A-Za-z0-9][A-Za-z0-9_-]*)(?: +\| +(?<title>.*?))? *$/;
const CLOSE_PATTERN = /^(?<indent> *)(?<fence>\/{3,}) *$/;

export function parseBlocksLine(line: string): BlocksLine {
  const openMatch = line.match(OPEN_PATTERN);
  if (openMatch !== null && openMatch.groups !== undefined) {
    const groups = openMatch.groups;
    const rawTitle = groups['title'];
    return {
      kind: 'open',
      name: groups['name'] ?? '',
      title: rawTitle === undefined || rawTitle === '' ? null : rawTitle,
      fenceLength: (groups['fence'] ?? '').length,
      indent: (groups['indent'] ?? '').length,
    };
  }

  const closeMatch = line.match(CLOSE_PATTERN);
  if (closeMatch !== null && closeMatch.groups !== undefined) {
    const groups = closeMatch.groups;
    return {
      kind: 'close',
      fenceLength: (groups['fence'] ?? '').length,
      indent: (groups['indent'] ?? '').length,
    };
  }

  return null;
}

/**
 * Detect Material for MkDocs grid HTML wrappers as line-level patterns.
 *
 * Material's grids are written as raw HTML — `<div class="grid cards" markdown>`
 * for the card-list flavor, `<div class="grid" markdown>` for the generic
 * variant — closed by `</div>`. The `markdown` attribute is mandatory; without
 * it, Python-Markdown does not descend into the body, so we mirror the same
 * gate.
 *
 * Pure: takes a single line, returns a typed opener record or null. The
 * companion `isGridCloseLine` recognizes the closing tag.
 */

type GridKind = 'cards' | 'generic';

export interface GridOpening {
  readonly kind: GridKind;
  readonly indent: number;
}

const OPEN_PATTERN = /^(?<indent> *)<div\b(?<attrs>[^>]*)>$/;
const CLOSE_PATTERN = /^\s*<\/div\s*>\s*$/;

export function parseGridOpenLine(line: string): GridOpening | null {
  const match = line.match(OPEN_PATTERN);
  if (match === null || match.groups === undefined) {
    return null;
  }
  const attrs = match.groups.attrs ?? '';
  if (!hasMarkdownAttr(attrs)) {
    return null;
  }
  const cls = extractClass(attrs);
  if (cls === null) {
    return null;
  }
  if (cls.includes('grid') && cls.includes('cards')) {
    return { kind: 'cards', indent: (match.groups.indent ?? '').length };
  }
  if (cls.split(/\s+/).includes('grid')) {
    return { kind: 'generic', indent: (match.groups.indent ?? '').length };
  }
  return null;
}

export function isGridCloseLine(line: string): boolean {
  return CLOSE_PATTERN.test(line);
}

function hasMarkdownAttr(attrs: string): boolean {
  return /\bmarkdown(\s*=\s*("[^"]*"|'[^']*'|\S+))?(?=\s|$)/.test(attrs);
}

function extractClass(attrs: string): string | null {
  const match = attrs.match(/\bclass\s*=\s*"([^"]+)"/);
  if (match === null) {
    return null;
  }
  return match[1] ?? null;
}

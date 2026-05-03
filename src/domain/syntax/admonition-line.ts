/**
 * Parse a single line as a Material for MkDocs admonition opening.
 *
 * Returns a structured `AdmonitionOpening` if the line is recognized, or `null`
 * if it is not. This is a pure value transformation — the caller decides what
 * to do with the parsed data (build a directive, emit a diagnostic, ignore).
 *
 * Recognized shapes:
 *   !!! type
 *   !!! type "Title"
 *   !!! type ""              (empty title strips icon per Material spec)
 *   ??? type [...]           (collapsible, closed by default)
 *   ???+ type [...]          (collapsible, open by default)
 *   !!! type inline [...]
 *   !!! type inline end [...]
 *
 * Leading whitespace is preserved as the `indent` field so callers can correctly
 * pair openings with their indented bodies.
 */

export type AdmonitionMarker = '!!!' | '???' | '???+';
export type InlineMode = 'left' | 'end';

export interface AdmonitionOpening {
  readonly marker: AdmonitionMarker;
  readonly type: string;
  readonly title: string | null;
  readonly hasEmptyTitle: boolean;
  readonly inline: InlineMode | null;
  readonly indent: number;
}

const PATTERN =
  /^(?<indent> *)(?<marker>!!!|\?\?\?\+|\?\?\?) +(?<type>[A-Za-z0-9][A-Za-z0-9_-]*)(?<modifiers>(?: +inline(?: +end)?)?)(?: +"(?<title>[^"]*)")? *$/;

export function parseAdmonitionLine(line: string): AdmonitionOpening | null {
  const match = line.match(PATTERN);
  if (match === null || match.groups === undefined) {
    return null;
  }

  const groups = match.groups;
  const rawTitle = groups['title'];

  return {
    marker: groups['marker'] as AdmonitionMarker,
    type: groups['type'] ?? '',
    title: rawTitle === undefined || rawTitle === '' ? null : rawTitle,
    hasEmptyTitle: rawTitle === '',
    inline: parseInline(groups['modifiers'] ?? ''),
    indent: (groups['indent'] ?? '').length,
  };
}

function parseInline(modifiers: string): InlineMode | null {
  if (/\binline +end\b/.test(modifiers)) {
    return 'end';
  }
  if (/\binline\b/.test(modifiers)) {
    return 'left';
  }
  return null;
}

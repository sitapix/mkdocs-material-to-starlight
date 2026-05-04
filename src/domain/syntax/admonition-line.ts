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

// Strict canonical Material syntax: `!!! type [inline [end]] ["Title"]`.
const PATTERN =
  /^(?<indent> *)(?<marker>!!!|\?\?\?\+|\?\?\?) +(?<type>[A-Za-z0-9][A-Za-z0-9_-]*)(?<modifiers>(?: +inline(?: +end)?)?)(?: +"(?<title>[^"]*)")? *$/;

// Lenient fallback used after the strict pattern fails. Captures the trailing
// text after the type (and optional `inline [end]` modifiers) as a literal
// title. Real-world content frequently drops the quotes (`!!! warning Foo`)
// or uses a dash separator (`!!! warning - Foo`); we recover gracefully so
// the admonition still converts to a Starlight aside.
const LENIENT_PATTERN =
  /^(?<indent> *)(?<marker>!!!|\?\?\?\+|\?\?\?) +(?<type>[A-Za-z0-9][A-Za-z0-9_-]*)(?<modifiers>(?: +inline(?: +end)?)?) +(?<rest>\S.*?) *$/;

export function parseAdmonitionLine(line: string): AdmonitionOpening | null {
  const strict = line.match(PATTERN);
  if (strict !== null && strict.groups !== undefined) {
    const groups = strict.groups;
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

  const lenient = line.match(LENIENT_PATTERN);
  if (lenient === null || lenient.groups === undefined) return null;
  const groups = lenient.groups;
  const rest = (groups['rest'] ?? '').trim();
  return {
    marker: groups['marker'] as AdmonitionMarker,
    type: groups['type'] ?? '',
    title: cleanLenientTitle(rest),
    hasEmptyTitle: false,
    inline: parseInline(groups['modifiers'] ?? ''),
    indent: (groups['indent'] ?? '').length,
  };
}

/**
 * Strip leading dash separators (e.g. `- Foo`) and unwrap surrounding quotes
 * if the title is double-quoted but contains internal quotes (greedy match —
 * `"on the "jsonable" nature of JSON schema"` → `on the "jsonable" nature of JSON schema`).
 */
function cleanLenientTitle(rest: string): string | null {
  let title = rest.replace(/^-\s+/, '');
  if (title.startsWith('"') && title.endsWith('"') && title.length >= 2) {
    title = title.slice(1, -1);
  }
  return title.length === 0 ? null : title;
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

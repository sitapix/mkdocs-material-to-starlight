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

type AdmonitionMarker = '!!!' | '???' | '???+';
type InlineMode = 'left' | 'end';

export interface AdmonitionOpening {
  readonly marker: AdmonitionMarker;
  readonly type: string;
  readonly title: string | null;
  readonly hasEmptyTitle: boolean;
  readonly inline: InlineMode | null;
  readonly indent: number;
}

// Strict canonical Material syntax: `!!! type [inline [end]] ["Title"]`.
// The space between marker and type is optional — real-world content
// frequently writes the compact form `???warning "Title"` (DDEV regression
// in `developers/building-contributing.md`). Material's parser tolerates
// either form, so we match it.
const PATTERN =
  /^(?<indent> *)(?<marker>!!!|\?\?\?\+|\?\?\?) *(?<type>[A-Za-z][A-Za-z0-9_-]*)(?<modifiers>(?: +inline(?: +end)?)?)(?: +"(?<title>[^"]*)")? *$/;

// Type-less collapsible: `??? "Title"` or `???+ "Title"`. Real-world DDEV
// regression: `users/install/ddev-installation.md` uses `??? "..."` without
// any type, expecting Material's default. We fall back to type "note" so the
// admonition still converts to a Starlight aside.
const TYPELESS_COLLAPSIBLE = /^(?<indent> *)(?<marker>\?\?\?\+|\?\?\?) +"(?<title>[^"]*)" *$/;

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
    const rawTitle = groups.title;
    return {
      marker: groups.marker as AdmonitionMarker,
      type: groups.type ?? '',
      title: rawTitle === undefined || rawTitle === '' ? null : rawTitle,
      hasEmptyTitle: rawTitle === '',
      inline: parseInline(groups.modifiers ?? ''),
      indent: (groups.indent ?? '').length,
    };
  }

  const typeless = line.match(TYPELESS_COLLAPSIBLE);
  if (typeless !== null && typeless.groups !== undefined) {
    const groups = typeless.groups;
    return {
      marker: groups.marker as AdmonitionMarker,
      type: 'note',
      title: groups.title ?? null,
      hasEmptyTitle: groups.title === '',
      inline: null,
      indent: (groups.indent ?? '').length,
    };
  }

  const lenient = line.match(LENIENT_PATTERN);
  if (lenient === null || lenient.groups === undefined) return null;
  const groups = lenient.groups;
  const rest = (groups.rest ?? '').trim();
  return {
    marker: groups.marker as AdmonitionMarker,
    type: groups.type ?? '',
    title: cleanLenientTitle(rest),
    hasEmptyTitle: false,
    inline: parseInline(groups.modifiers ?? ''),
    indent: (groups.indent ?? '').length,
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

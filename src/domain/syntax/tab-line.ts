/**
 * Parse a single line as a Material for MkDocs content-tab opening.
 *
 * Recognized shapes:
 *   === "Title"
 *   ===! "Title"     (exclusive variant — only one tab in the group can be selected)
 *
 * Indentation is preserved. Empty titles and unquoted titles are rejected,
 * matching PyMdown's `tabbed` extension behaviour.
 *
 * Pure: takes a string, returns a record or null.
 */

type TabMarker = '===' | '===!';

export interface TabOpening {
  readonly marker: TabMarker;
  readonly title: string;
  readonly exclusive: boolean;
  readonly indent: number;
}

const PATTERN = /^(?<indent> *)(?<marker>===!|===) +"(?<title>[^"]+)" *$/;

export function parseTabLine(line: string): TabOpening | null {
  const match = line.match(PATTERN);
  if (match === null || match.groups === undefined) {
    return null;
  }

  const groups = match.groups;
  const marker = groups.marker as TabMarker;

  return {
    marker,
    title: groups.title ?? '',
    exclusive: marker === '===!',
    indent: (groups.indent ?? '').length,
  };
}

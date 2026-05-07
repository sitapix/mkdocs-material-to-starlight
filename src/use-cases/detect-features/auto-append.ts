/**
 * Extract the `auto_append` paths from a `pymdownx.snippets` markdown
 * extension entry in `mkdocs.yml`.
 *
 * Material's site-wide glossary pattern looks like this:
 *
 *   markdown_extensions:
 *     - pymdownx.snippets:
 *         auto_append:
 *           - includes/abbreviations.md
 *           - includes/glossary.md
 *
 * The named files are appended to every page's body before Markdown
 * processing, typically carrying abbreviation definitions or shared
 * boilerplate. The migration tool reads each path once and appends its
 * content to every source file before snippet expansion runs.
 *
 * Pure: takes the parsed extension list, returns string[]. No I/O.
 */

import type { MkdocsMarkdownExtension } from '../../domain/config/mkdocs-config.js';

const SNIPPETS_NAME = 'pymdownx.snippets';

export function extractAutoAppend(
  extensions: ReadonlyArray<MkdocsMarkdownExtension>,
): ReadonlyArray<string> {
  for (const ext of extensions) {
    if (ext.name !== SNIPPETS_NAME) {
      continue;
    }
    const raw = ext.options.auto_append;
    if (!Array.isArray(raw)) {
      continue;
    }
    return raw.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

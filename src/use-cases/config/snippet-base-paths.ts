/**
 * Extract the directories `pymdownx.snippets` searches when resolving
 * `--8<-- "..."` includes.
 *
 * Source-of-truth precedence:
 *   1. The extension's `base_path:` option in `mkdocs.yml`, if present.
 *      Accepts either a list of paths or a single string.
 *   2. A `["docs"]` fallback when the extension is configured but no
 *      `base_path` is set. Material's documented default is the project
 *      root, but in nearly every MkDocs site we've seen the docs/ folder
 *      is the only useful starting point — without this fallback the
 *      wizard's snippet prompt would fire with zero candidates and the
 *      multiselect would be silently skipped.
 *   3. Empty when the extension is not configured at all.
 *
 * Used by the wizard runner to populate `ConversionPlan.snippetCandidateDirs`
 * so the user can pick which directories to scan during conversion. The
 * resulting paths are passed verbatim to `--snippet-base-path`.
 */

import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';

const SNIPPETS_EXTENSION = 'pymdownx.snippets';
const FALLBACK_BASE_PATH = 'docs';

export function extractSnippetBasePaths(
  config: MkdocsConfig,
): ReadonlyArray<string> {
  const ext = config.markdownExtensions.find((e) => e.name === SNIPPETS_EXTENSION);
  if (ext === undefined) return [];

  const raw = ext.options['base_path'];
  if (raw === undefined || raw === null) return [FALLBACK_BASE_PATH];

  if (typeof raw === 'string') return [raw];

  if (Array.isArray(raw)) {
    const cleaned = raw.filter((v): v is string => typeof v === 'string');
    return cleaned.length > 0 ? cleaned : [FALLBACK_BASE_PATH];
  }

  return [FALLBACK_BASE_PATH];
}

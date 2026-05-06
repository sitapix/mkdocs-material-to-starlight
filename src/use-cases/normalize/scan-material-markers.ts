/**
 * Scanner: detect Material-specific in-source markers that the converter
 * cannot translate but users likely want to know about.
 *
 *   1. `<!-- material/tags -->` (with or without `{ ... }` parameters) —
 *      Material's tags-plugin index marker. Becomes an inert HTML comment
 *      after migration; the user needs the `starlight-tags` plugin's
 *      `<TagsList />` component to recreate the listing.
 *
 *   2. `comments: true` in YAML frontmatter — Material's per-page comments
 *      activation flag (paired with a Giscus partial override). No
 *      Starlight built-in; the `starlight-giscus` community plugin is the
 *      closest equivalent.
 *
 * Pure read (no text mutation). Fence-shielded for the tags marker so
 * documentation about the marker (inside fenced code) does not falsely
 * fire. The frontmatter check operates only on the leading `---`-delimited
 * YAML block.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { isFenceLine } from '../../domain/syntax/fence.js';
const TAGS_MARKER_RE = /<!--\s*material\/tags(?:\s*\{[^}]*\})?\s*-->/;
const MORE_MARKER_RE = /^<!--\s*more\s*-->\s*$/;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const COMMENTS_TRUE_RE = /^[ \t]*comments:[ \t]+true[ \t]*$/m;

export function scanMaterialMarkers(source: string): ReadonlyArray<Diagnostic> {
  const out: Diagnostic[] = [];

  const fmMatch = source.match(FRONTMATTER_RE);
  if (fmMatch !== null && COMMENTS_TRUE_RE.test(fmMatch[1] ?? '')) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'comments-frontmatter-detected',
        source: 'normalize/scan-material-markers',
        message:
          'Page frontmatter sets `comments: true`, Material\'s flag for activating the optional Giscus comment widget. Starlight has no built-in comments. Install the `starlight-giscus` community plugin (dragomano/starlight-giscus) to recreate the per-page comments UX, or remove the flag if comments were disabled at the theme level.',
      }),
    );
  }

  const lines = source.split('\n');
  let inFence = false;
  let lineNumber = 0;
  for (const line of lines) {
    lineNumber += 1;
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (TAGS_MARKER_RE.test(line)) {
      out.push(
        createDiagnostic({
          severity: 'warning',
          ruleId: 'material-tags-marker-detected',
          source: 'normalize/scan-material-markers',
          message:
            'Material\'s `<!-- material/tags -->` index marker detected — used to render a list of all tagged pages on a tags index page. Starlight has no equivalent; the marker becomes an inert HTML comment in the converted output. Install the `starlight-tags` plugin (frostybee/starlight-tags) and replace this marker with its `<TagsList />` JSX component (the file becomes `.mdx`).',
          place: { line: lineNumber, column: 1 },
        }),
      );
      // Only one tags-marker diagnostic per file is useful — multiple markers
      // on a single tags-index page generate the same migration action.
      break;
    }
  }

  if (containsMoreMarker(source)) {
    out.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'blog-more-marker-detected',
        source: 'normalize/scan-material-markers',
        message:
          'Material blog post excerpt separator `<!-- more -->` detected. `starlight-blog` derives post excerpts from frontmatter `excerpt:` (when present) or the first paragraph (default), not from an inline marker. The `<!-- more -->` line passes through as an inert HTML comment in the converted output; either move the excerpt content into an `excerpt:` frontmatter field for parity, or accept the default first-paragraph behaviour.',
      }),
    );
  }

  return out;
}

function containsMoreMarker(source: string): boolean {
  const lines = source.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (MORE_MARKER_RE.test(line.trim())) return true;
  }
  return false;
}

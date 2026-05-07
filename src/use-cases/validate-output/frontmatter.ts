/**
 * Pre-flight validation: scan a converted file's frontmatter and emit a
 * diagnostic for every field that Starlight's `docsSchema()` does not
 * recognize. Astro's Zod-based content-collection validation rejects
 * unknown frontmatter keys at build time, so a converter that silently
 * preserves MkDocs-specific frontmatter (e.g. `tags`, `authors`) produces a
 * project that fails its first build.
 *
 * This validator runs without invoking Astro itself — it is a static check
 * against the allowlist in `domain/starlight/frontmatter-schema.ts`. The
 * caller (typically `convertSite`) attaches the diagnostics to the site-level
 * report so the user sees every offending file before they `npm run build`.
 *
 * Pure: takes a Markdown source string, returns an array of `Diagnostic`s.
 * No I/O. Empty / no-frontmatter files yield no diagnostics.
 */

import type { Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { STARLIGHT_FRONTMATTER_FIELDS } from '../../domain/starlight/frontmatter-schema.js';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const KEY_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:/;

export function validateFrontmatter(source: string): ReadonlyArray<Diagnostic> {
  const match = source.match(FRONTMATTER_RE);
  if (match === null) {
    return [];
  }
  const body = match[1] ?? '';
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  let line = 1;
  for (const raw of body.split('\n')) {
    const indent = raw.length - raw.trimStart().length;
    const keyMatch = raw.match(KEY_RE);
    if (indent === 0 && keyMatch !== null) {
      const key = keyMatch[1] ?? '';
      seen.add(key);
      if (!STARLIGHT_FRONTMATTER_FIELDS.has(key)) {
        diagnostics.push({
          ruleId: 'unknown-frontmatter-field',
          severity: 'warning',
          message: `frontmatter field "${key}" is not in Starlight's docsSchema — auto-extended in src/content.config.ts with an inferred Zod type; review and tighten if needed`,
          source: 'validate-output/frontmatter',
          place: { line: line + 1, column: 1 },
        });
      }
    }
    line += 1;
  }
  if (!seen.has('title')) {
    diagnostics.push({
      ruleId: 'missing-required-title',
      severity: 'error',
      message:
        'Starlight requires a `title` frontmatter field; ensure-title should have synthesized one — this is a converter bug, not a user error',
      source: 'validate-output/frontmatter',
      place: { line: 1, column: 1 },
    });
  }
  return diagnostics;
}

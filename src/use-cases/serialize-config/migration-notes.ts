/**
 * Compose a `MIGRATION_NOTES.md` file from the run's diagnostics and the
 * unmapped `mkdocs.yml` extras.
 *
 * Pure: takes the aggregated data, returns Markdown text. Diagnostics are
 * grouped by `ruleId` (sorted alphabetically) with per-source-path bullet
 * lists. Unmapped config fields get their own section so the user can decide
 * which to recreate manually in `astro.config.mjs`.
 *
 * Output is intentionally human-readable rather than machine-parseable —
 * machine consumers should read `migration-report.json` (a future artifact).
 */

import type { TaggedDiagnostic } from '../convert-site/convert.js';
import {
  inferFrontmatterTypes,
  type FrontmatterDoc,
} from '../validate-output/infer-frontmatter-types.js';

export interface MigrationNotesInput {
  readonly diagnostics: ReadonlyArray<TaggedDiagnostic>;
  readonly extras: Readonly<Record<string, unknown>>;
  /**
   * Source files (post-conversion) used to infer per-field Zod types for the
   * auto-generated `docsSchema({ extend })` snippet. Optional — when omitted
   * the snippet falls back to `z.unknown().optional()` per field.
   */
  readonly sourceDocs?: ReadonlyArray<FrontmatterDoc>;
}

export function serializeMigrationNotes(input: MigrationNotesInput): string {
  const lines: string[] = ['# Migration Notes', ''];

  if (input.diagnostics.length === 0 && Object.keys(input.extras).length === 0) {
    lines.push('No issues found during conversion.', '');
    return lines.join('\n');
  }

  if (input.diagnostics.length === 0) {
    lines.push('No diagnostics. See unmapped fields below.', '');
  } else {
    appendDiagnosticSections(lines, input.diagnostics);
  }

  appendDocsSchemaExtendSection(lines, input.diagnostics, input.sourceDocs ?? []);

  if (Object.keys(input.extras).length > 0) {
    appendExtrasSection(lines, input.extras);
  }

  return lines.join('\n');
}

const FIELD_NAME_RE = /frontmatter field "([^"]+)"/;

function collectUnknownFrontmatterFields(
  diagnostics: ReadonlyArray<TaggedDiagnostic>,
): ReadonlyArray<string> {
  const fields = new Set<string>();
  for (const tagged of diagnostics) {
    if (tagged.diagnostic.ruleId !== 'unknown-frontmatter-field') continue;
    const match = tagged.diagnostic.message.match(FIELD_NAME_RE);
    if (match !== null && match[1] !== undefined) fields.add(match[1]);
  }
  return [...fields].sort();
}

function appendDocsSchemaExtendSection(
  lines: string[],
  diagnostics: ReadonlyArray<TaggedDiagnostic>,
  sourceDocs: ReadonlyArray<FrontmatterDoc>,
): void {
  const fields = collectUnknownFrontmatterFields(diagnostics);
  if (fields.length === 0) return;
  const inferred = inferFrontmatterTypes(fields, sourceDocs);
  lines.push('## Extending the docsSchema', '');
  lines.push(
    'Your pages use frontmatter fields that Starlight\'s `docsSchema()` does not recognize. The generated `src/content.config.ts` already extends the schema with the snippet below — types were inferred from the values observed across your source files. Review and tighten as needed.',
    '',
    '```ts',
    'import { defineCollection } from \'astro:content\';',
    'import { z } from \'astro/zod\';',
    'import { docsLoader } from \'@astrojs/starlight/loaders\';',
    'import { docsSchema } from \'@astrojs/starlight/schema\';',
    '',
    'export const collections = {',
    '  docs: defineCollection({',
    '    loader: docsLoader(),',
    '    schema: docsSchema({',
    '      extend: z.object({',
    ...fields.map(
      (field) =>
        `        ${field}: ${inferred[field] ?? 'z.unknown().optional()'},`,
    ),
    '      }),',
    '    }),',
    '  }),',
    '};',
    '```',
    '',
  );
}

function appendDiagnosticSections(
  lines: string[],
  diagnostics: ReadonlyArray<TaggedDiagnostic>,
): void {
  const grouped = new Map<string, TaggedDiagnostic[]>();
  for (const tagged of diagnostics) {
    const existing = grouped.get(tagged.diagnostic.ruleId) ?? [];
    existing.push(tagged);
    grouped.set(tagged.diagnostic.ruleId, existing);
  }
  const ruleIds = [...grouped.keys()].sort();
  for (const ruleId of ruleIds) {
    const entries = grouped.get(ruleId) ?? [];
    lines.push(`## ${ruleId} (${entries.length})`, '');
    for (const tagged of entries) {
      const place = tagged.diagnostic.place;
      const locator =
        place === undefined ? tagged.sourcePath : `${tagged.sourcePath}:${place.line}:${place.column}`;
      lines.push(`- **${locator}** — ${tagged.diagnostic.message}`);
    }
    lines.push('');
  }
}

function appendExtrasSection(
  lines: string[],
  extras: Readonly<Record<string, unknown>>,
): void {
  lines.push('## Unmapped mkdocs.yml fields', '');
  lines.push(
    'These top-level keys were present in your `mkdocs.yml` but the converter has no automated mapping for them. Review them and recreate any you still need in `astro.config.mjs` or as Astro components.',
    '',
  );
  const keys = Object.keys(extras).sort();
  for (const key of keys) {
    lines.push(`- \`${key}\``);
  }
  lines.push('');
}

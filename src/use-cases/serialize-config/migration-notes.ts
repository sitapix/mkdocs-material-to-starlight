/**
 * Compose a `MIGRATION_NOTES.md` file from the run's diagnostics and the
 * unmapped `mkdocs.yml` extras.
 *
 * Pure: takes the aggregated data, returns Markdown text. The report is
 * grouped by severity (errors → warnings → info) so the user attacks the
 * blocking issues first; within each severity bucket, ruleIds sort
 * alphabetically. The renderer pulls each ruleId's `description` and
 * `fix` from the diagnostic registry once per ruleId — users see the
 * actionable text once instead of once per occurrence.
 *
 * Output is intentionally human-readable rather than machine-parseable —
 * machine consumers should read `migration-report.json` (a future artifact).
 */
import type { Severity } from '../../domain/diagnostics/diagnostic.js';
import { getRegisteredRuleId } from '../../domain/diagnostics/registry.js';
import type { TaggedDiagnostic } from '../convert-site/convert.js';
import {
  type FrontmatterDoc,
  inferFrontmatterTypes,
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

const STARLIGHT_HOME = 'https://starlight.astro.build/';
const STARLIGHT_FRONTMATTER_DOCS =
  'https://starlight.astro.build/reference/frontmatter/#customize-frontmatter-schema';
const STARLIGHT_CONFIG_DOCS = 'https://starlight.astro.build/reference/configuration/';

// Light, hand-curated lookup for top-level mkdocs.yml keys that have an
// obvious Starlight/Astro equivalent. Keep entries terse — the report is
// for orienting users, not replacing the docs.
const EXTRA_KEY_HINTS: Readonly<Record<string, string>> = {
  extra_css:
    'Move custom CSS files into `src/styles/` and pass them via the Starlight ' +
    '[`customCss`](https://starlight.astro.build/reference/configuration/#customcss) option.',
  extra_javascript:
    'Inject scripts via the Starlight ' +
    '[`head`](https://starlight.astro.build/reference/configuration/#head) option, ' +
    'or import them inside a custom component override.',
  extra:
    "Material's `extra:` namespace has no direct Starlight equivalent. " +
    'Recreate values needed at build time as Astro `import.meta.env` variables ' +
    'or move them into your custom component code.',
  site_author:
    'Recreate as a `<meta name="author">` tag via the Starlight ' +
    '[`head`](https://starlight.astro.build/reference/configuration/#head) option.',
  copyright:
    'Override `Footer.astro` (Starlight ' +
    '[component override](https://starlight.astro.build/reference/overrides/)) ' +
    'and render the copyright text inside the existing footer slot.',
  google_analytics:
    "Material's inline `google_analytics:` value has no direct mapping. Browse " +
    "[Starlight's plugin list](https://starlight.astro.build/resources/plugins/) " +
    'for an analytics plugin, or inject your tracking snippet via the Starlight ' +
    '[`head`](https://starlight.astro.build/reference/configuration/#head) option.',
  strict:
    "Astro's build is strict by default. Run `npm run build` to see the equivalent " +
    'integrity checks (broken refs, schema mismatches).',
  use_directory_urls:
    'Astro and Starlight emit clean directory URLs out of the box, so no config is needed. ' +
    'If your `mkdocs.yml` had `use_directory_urls: false`, audit incoming external ' +
    'links that ended in `.html`.',
  watch: 'No equivalent. `astro dev` already watches the source tree.',
  remote_branch:
    'Configure deploy in your hosting platform (Cloudflare Pages, Vercel, Netlify, ' +
    'GitHub Pages action). Astro and Starlight ship no `gh-deploy`-style command.',
  remote_name: 'Same as `remote_branch`: configure deploy in your hosting platform.',
  dev_addr: 'Use `astro dev --host --port <n>` (or `vite.preview.port` in `astro.config.mjs`).',
};

const SEVERITY_ORDER: ReadonlyArray<Severity> = ['error', 'warning', 'info'];
const SEVERITY_HEADERS: Readonly<Record<Severity, string>> = {
  error: '## Errors (must fix before `astro check` will pass)',
  warning: '## Warnings (review before shipping)',
  info: '## Info (no action required; worth a skim)',
};

export function serializeMigrationNotes(input: MigrationNotesInput): string {
  const lines: string[] = ['# Migration Notes', ''];

  if (input.diagnostics.length === 0 && Object.keys(input.extras).length === 0) {
    lines.push(
      'No issues found during conversion. Your site is ready to build.',
      '',
      '## Next steps',
      '',
      '```bash',
      'cd <your-output-dir>',
      'npm install',
      'npm run dev',
      '```',
      '',
      'Open the generated site in your browser. Theming, sidebar config, and the ' +
        `component reference live at [${STARLIGHT_HOME}](${STARLIGHT_HOME}).`,
      '',
    );
    return lines.join('\n');
  }

  appendIntro(lines, input.diagnostics);

  if (input.diagnostics.length > 0) {
    appendDiagnosticSections(lines, input.diagnostics);
  }
  appendDocsSchemaExtendSection(lines, input.diagnostics, input.sourceDocs ?? []);
  if (Object.keys(input.extras).length > 0) {
    appendExtrasSection(lines, input.extras);
  }
  appendNextStepsSection(lines);

  return lines.join('\n');
}

function appendIntro(lines: string[], diagnostics: ReadonlyArray<TaggedDiagnostic>): void {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const tagged of diagnostics) {
    counts[tagged.diagnostic.severity] += 1;
  }
  const summary = SEVERITY_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}${counts[s] === 1 ? '' : 's'}`)
    .join(', ');

  lines.push(
    'This report lists every transformation the converter could not finish on its own. ' +
      'Sections are grouped by severity:',
    '',
    '- **Errors** block `astro check`. Fix these before the site builds.',
    '- **Warnings** ship, but the output may diverge from your MkDocs source. Review each one.',
    '- **Info** flags lossy or intentional rewrites. Audit them at your leisure.',
    '',
    `**Summary:** ${summary}.`,
    '',
    'Each section opens with a one-line description and a recommended fix, then ' +
      'lists every file:line where the issue triggered. Run ' +
      '`mkdocs-material-to-starlight --explain <ruleId>` for the long-form remediation. ' +
      `Starlight docs: [${STARLIGHT_HOME}](${STARLIGHT_HOME}).`,
    '',
  );
}

function appendDiagnosticSections(
  lines: string[],
  diagnostics: ReadonlyArray<TaggedDiagnostic>,
): void {
  const bySeverity = new Map<Severity, TaggedDiagnostic[]>();
  for (const tagged of diagnostics) {
    const list = bySeverity.get(tagged.diagnostic.severity) ?? [];
    list.push(tagged);
    bySeverity.set(tagged.diagnostic.severity, list);
  }

  for (const severity of SEVERITY_ORDER) {
    const inThisSeverity = bySeverity.get(severity) ?? [];
    if (inThisSeverity.length === 0) continue;
    lines.push(SEVERITY_HEADERS[severity], '');

    // Sub-group by ruleId so the section header carries the description+fix.
    const byRule = new Map<string, TaggedDiagnostic[]>();
    for (const tagged of inThisSeverity) {
      const list = byRule.get(tagged.diagnostic.ruleId) ?? [];
      list.push(tagged);
      byRule.set(tagged.diagnostic.ruleId, list);
    }
    const sortedRules = [...byRule.keys()].sort();
    for (const ruleId of sortedRules) {
      appendRuleSubsection(lines, ruleId, byRule.get(ruleId) ?? []);
    }
  }
}

function appendRuleSubsection(
  lines: string[],
  ruleId: string,
  occurrences: ReadonlyArray<TaggedDiagnostic>,
): void {
  const entry = getRegisteredRuleId(ruleId);
  const count = occurrences.length;
  const occurrenceLabel = count === 1 ? '1 occurrence' : `${count} occurrences`;
  lines.push(`### \`${ruleId}\` — ${occurrenceLabel}`, '');
  if (entry !== null) {
    lines.push(`**What this is:** ${entry.description}`, '');
    lines.push(`**How to fix:** ${entry.fix}`, '');
  }
  lines.push('**Where it occurred:**', '');
  for (const tagged of occurrences) {
    const place = tagged.diagnostic.place;
    const locator =
      place === undefined
        ? tagged.sourcePath
        : `${tagged.sourcePath}:${place.line}:${place.column}`;
    lines.push(`- \`${locator}\` — ${tagged.diagnostic.message}`);
  }
  lines.push('');
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
  lines.push(
    '## Extending the docsSchema',
    '',
    "Your pages use frontmatter fields that Starlight's `docsSchema()` does not " +
      'recognize. The generated `src/content.config.ts` already extends the schema ' +
      'with the snippet that follows. The converter inferred each type from the ' +
      'values it saw in your source files. Tighten the result yourself: swap ' +
      '`z.string()` for `z.enum([...])`, add `.optional()` where you have nullable ' +
      "fields, or drop entries you don't need. " +
      `Schema reference: [${STARLIGHT_FRONTMATTER_DOCS}](${STARLIGHT_FRONTMATTER_DOCS}).`,
    '',
    '```ts',
    "import { defineCollection } from 'astro:content';",
    "import { z } from 'astro/zod';",
    "import { docsLoader } from '@astrojs/starlight/loaders';",
    "import { docsSchema } from '@astrojs/starlight/schema';",
    '',
    'export const collections = {',
    '  docs: defineCollection({',
    '    loader: docsLoader(),',
    '    schema: docsSchema({',
    '      extend: z.object({',
    ...fields.map((field) => `        ${field}: ${inferred[field] ?? 'z.unknown().optional()'},`),
    '      }),',
    '    }),',
    '  }),',
    '};',
    '```',
    '',
  );
}

function appendExtrasSection(lines: string[], extras: Readonly<Record<string, unknown>>): void {
  lines.push('## Unmapped mkdocs.yml fields', '');
  lines.push(
    'Your `mkdocs.yml` declares these top-level keys, but the converter has no ' +
      'automatic mapping for them. Recreate the ones you still need in ' +
      '`astro.config.mjs`, or wire them into a custom Astro component. ' +
      `Starlight config reference: [${STARLIGHT_CONFIG_DOCS}](${STARLIGHT_CONFIG_DOCS}).`,
    '',
  );
  const keys = Object.keys(extras).sort();
  for (const key of keys) {
    const hint = EXTRA_KEY_HINTS[key];
    if (hint !== undefined) {
      lines.push(`- \`${key}\` — ${hint}`);
    } else {
      lines.push(`- \`${key}\``);
    }
  }
  lines.push('');
}

function appendNextStepsSection(lines: string[]): void {
  lines.push(
    '## Next steps',
    '',
    'When you have triaged the items in this report:',
    '',
    '```bash',
    'cd <your-output-dir>',
    'npm install',
    'npm run dev',
    '```',
    '',
    `Open the generated site in your browser. Theming, sidebar config, and the ` +
      `component reference: [${STARLIGHT_HOME}](${STARLIGHT_HOME}). ` +
      'For any unfamiliar `ruleId`, run ' +
      '`mkdocs-material-to-starlight --explain <ruleId>`.',
    '',
  );
}

/**
 * Per-occurrence scan helpers for three previously bulk-emitted diagnostics.
 *
 * Each function takes an array of (sourcePath, content) pairs and returns
 * per-file TaggedDiagnostic-compatible objects for inclusion in MIGRATION_NOTES.
 *
 * All functions are pure: no I/O, no side-effects.
 */

import { createDiagnostic } from '../../domain/diagnostics/diagnostic.js';

export interface TaggedDiagnosticLight {
  readonly sourcePath: string;
  readonly diagnostic: ReturnType<typeof createDiagnostic>;
}

/** Matches a `=== "Tab Label"` content-tab block opener. */
const TABS_LINK_RE = /^={3,}\s*"/m;

/** Matches a fenced code block with linenums option. */
const LINENUMS_FENCE_RE = /^```\w+[^`]*?\blinenums\b/m;

/**
 * Scan source files for `=== "Tab"` content-tab blocks.
 * Used when `content.tabs.link` is enabled.
 */
export function scanTabsLinkOccurrences(
  files: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<TaggedDiagnosticLight> {
  const out: TaggedDiagnosticLight[] = [];
  for (const [sourcePath, content] of files) {
    if (!TABS_LINK_RE.test(content)) continue;
    out.push({
      sourcePath,
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'feature-tabs-link-occurrence',
        source: 'detect-features/scan-bulk-diagnostics',
        message: `content.tabs.link: file "${sourcePath}" contains tab blocks that will receive syncKey in the output.`,
      }),
    });
  }
  return out;
}

/**
 * Scan source files for code fences with the `linenums` option.
 * Used when `codehilite` extension is active.
 */
export function scanCodehiliteLinenumsOccurrences(
  files: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<TaggedDiagnosticLight> {
  const out: TaggedDiagnosticLight[] = [];
  for (const [sourcePath, content] of files) {
    if (!LINENUMS_FENCE_RE.test(content)) continue;
    out.push({
      sourcePath,
      diagnostic: createDiagnostic({
        severity: 'info',
        ruleId: 'extension-codehilite-linenums-occurrence',
        source: 'detect-features/scan-bulk-diagnostics',
        message: `codehilite linenums: file "${sourcePath}" has a fenced code block with linenums option. Expressive Code renders line numbers natively.`,
      }),
    });
  }
  return out;
}

/**
 * Emit a diagnostic for each `.meta.yml` file detected in the docs directory.
 * Used when the Material `meta` plugin is active.
 */
export function scanMetaYmlFiles(
  metaFiles: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<TaggedDiagnosticLight> {
  return metaFiles.map(([sourcePath, content]) => ({
    sourcePath,
    diagnostic: createDiagnostic({
      severity: 'warning',
      ruleId: 'plugin-meta-config-detected',
      source: 'detect-features/scan-bulk-diagnostics',
      message: `meta plugin: .meta.yml found at "${sourcePath}". Frontmatter keys: ${summarizeYamlKeys(content)}. Inline these into each affected page.`,
    }),
  }));
}

/**
 * Extract top-level YAML key names from content for a brief summary.
 * Does not parse YAML — just looks for leading `key:` patterns.
 */
function summarizeYamlKeys(content: string): string {
  const keys: string[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
    if (m !== null) keys.push(m[1] ?? '');
  }
  return keys.length === 0 ? '(none)' : keys.join(', ');
}

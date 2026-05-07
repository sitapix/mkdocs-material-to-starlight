/**
 * Build the wizard's "things you'll need to handle yourself" preview from a
 * loaded mkdocs config. Pure: takes config, returns a list of items the UI
 * shell can render before any prompt fires.
 *
 * Source of truth is `diagnosePlugins` (the same data that ends up in
 * MIGRATION_NOTES.md). We filter to entries that genuinely need user action
 * (severity === 'warning'), dedupe by ruleId, and attach a docs URL via
 * `docs-links.ts` so every line has a learn-more destination. Info-only
 * acknowledgements (search → Pagefind, optimize → astro:assets) are dropped:
 * showing them would dilute the signal of "you must do something."
 */
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import { diagnosePlugins } from '../detect-features/diagnose-plugins.js';
import { pluginDocsUrl } from './docs-links.js';

export interface NeedsAttentionItem {
  /** The mkdocs plugin or extension name as it appears in the config. */
  readonly name: string;
  /** Stable diagnostic identifier (also the MIGRATION_NOTES.md grep key). */
  readonly ruleId: string;
  /** One-line description suitable for a terminal preview. */
  readonly summary: string;
  /** Canonical docs URL the user can open to learn more. */
  readonly docsUrl: string;
}

export function needsAttentionPreview(config: MkdocsConfig): ReadonlyArray<NeedsAttentionItem> {
  const diagnostics = diagnosePlugins(config.plugins, config.markdownExtensions);
  const items: NeedsAttentionItem[] = [];
  const seenRules = new Set<string>();

  for (const item of [...config.plugins, ...config.markdownExtensions]) {
    const diag = diagnostics.find((d) =>
      // Match by message containing the name OR by the well-known ruleId for
      // the input. We re-walk the inputs (rather than the diagnostic list
      // alone) so the human-friendly `name` field reflects what the user
      // actually wrote in mkdocs.yml.
      ruleAppliesTo(d.ruleId, item.name),
    );
    if (diag === undefined) continue;
    // Skip rules whose canonical phrasing is "no action required" — Astro/MDX
    // already covers them, so listing them dilutes the signal of "you must
    // do something." Everything else (warnings + info-level mapped/detected
    // entries) gets surfaced because the user has follow-up work.
    if (NO_ACTION_RULES.has(diag.ruleId)) continue;
    if (seenRules.has(diag.ruleId)) continue;
    seenRules.add(diag.ruleId);
    const docsUrl = pluginDocsUrl(item.name);
    if (docsUrl === null) continue;
    items.push({
      name: item.name,
      ruleId: diag.ruleId,
      summary: diag.message,
      docsUrl,
    });
  }
  return items;
}

/**
 * Diagnostic rules whose remediation is "nothing — Astro/MDX already
 * handles it." Listing these in the wizard preview is noise.
 */
const NO_ACTION_RULES: ReadonlySet<string> = new Set([
  'plugin-search-replaced',
  'plugin-optimize-subsumed',
  'plugin-info-subsumed',
  'extension-striphtml-subsumed',
  'extension-pathconverter-subsumed',
  'extension-saneheaders-detected',
  'extension-escapeall-detected',
]);

/**
 * Loose match between the diagnostic ruleId and the input plugin/extension
 * name. The diagnostic registry uses one ruleId per "concept" (e.g.
 * `plugin-swagger-ui-mapped` is shared by three swagger-renderer plugins),
 * so we normalize both sides to a comparable token set.
 */
function ruleAppliesTo(ruleId: string, name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return ruleId.toLowerCase().includes(normalized) || ruleHits(ruleId, name);
}

/**
 * Hand-coded fallback for ruleId/name pairs whose tokens don't share a
 * substring (e.g. `plugin-swagger-ui-mapped` for `mkdocs-redoc-tag`).
 */
function ruleHits(ruleId: string, name: string): boolean {
  const aliases: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
    [
      'plugin-swagger-ui-mapped',
      ['swagger-ui-tag', 'mkdocs-swagger-ui-tag', 'mkdocs-redoc-tag', 'render-swagger'],
    ],
    ['plugin-pdf-export-mapped', ['pdf-export', 'with-pdf']],
    ['plugin-git-authors-mapped', ['git-authors', 'git-committers']],
    ['plugin-click-no-equivalent', ['click', 'mkdocs-click']],
  ];
  return aliases.some(([rule, names]) => rule === ruleId && names.includes(name));
}

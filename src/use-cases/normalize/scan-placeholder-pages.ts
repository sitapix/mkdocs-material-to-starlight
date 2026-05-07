/**
 * Detect Material monorepo/multirepo-plugin placeholder pages and emit a
 * single warning diagnostic per file.
 *
 * Material sites that use mkdocs-monorepo-plugin or mkdocs-multirepo-plugin
 * stitch in content from external repos at MkDocs build time. The
 * placeholder pages in the source repo carry only a short stub like:
 *
 *   | This page is a placeholder for the foo repo's docs. |
 *   | If you can see this page there has been an error    |
 *
 * The converter cannot fetch the external content (the plugin runs Python
 * fetch logic the converter does not replicate), so the placeholder is
 * what the user actually sees post-conversion. Without a clear warning,
 * users mistakenly think the converter dropped content.
 *
 * Pure read (no text mutation). Returns at most ONE diagnostic per file
 * (presence-only, not per-occurrence). Idempotent.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const PLACEHOLDER_PHRASE_RE =
  /placeholder for (?:the\s+)?[a-z0-9_-]+(?:\s+repo|['']s\s+(?:docs|content))/i;
const ERROR_PHRASE_RE =
  /(?:you (?:can )?see this (?:page|content) (?:there has been|because of) an error|report (?:the issue|this) on gitlab)/i;

export function scanPlaceholderPage(source: string): Diagnostic | null {
  if (source.length === 0) return null;
  const matchPlaceholder = PLACEHOLDER_PHRASE_RE.exec(source);
  const matchError = ERROR_PHRASE_RE.exec(source);
  if (matchPlaceholder === null && matchError === null) return null;

  return createDiagnostic({
    severity: 'warning',
    ruleId: 'placeholder-page-detected',
    source: 'normalize/scan-placeholder-pages',
    message:
      "This page contains only a placeholder stub — the actual content is normally fetched from another repository at MkDocs build time by `mkdocs-monorepo-plugin` (or a similar multi-repo stitching plugin). The converter does not replicate that fetch, so post-conversion the page renders the placeholder text only. Either (a) clone the source repository's content into the page before running the converter, (b) delete the placeholder file from the converted output and remove it from the sidebar, or (c) replace it with a link to the external repository's real docs site.",
  });
}

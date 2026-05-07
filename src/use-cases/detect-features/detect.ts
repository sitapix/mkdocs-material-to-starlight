/**
 * Scan a Markdown source for the features whose presence drives extra
 * dependencies and plugin wiring in the generated Starlight project.
 *
 * Currently detected:
 *   - 'math'          — `$$...$$` block or `$...$` inline (pymdownx.arithmatex)
 *   - 'mermaid'       — ```mermaid``` fenced block (via pymdownx.superfences)
 *   - 'github-alerts' — `> [!NOTE]` / `[!TIP]` / etc. GitHub blockquote alerts
 *
 * Pure: takes a source string, returns a `Set<DetectedFeature>`. The site-
 * level orchestrator unions these per-file sets and passes the union to
 * `serializePackageJson` and `serializeAstroConfig` so the generated project
 * imports the right plugins.
 *
 * The detector is conservative: it only fires when the syntactic shape is
 * unambiguous. Bare `$5` currency markers do NOT trigger math; only `$$...$$`
 * or balanced `$x$` with non-space adjacents.
 */

import { sourceContainsGithubAlerts } from '../normalize/scan-github-alerts.js';
import type { DetectedFeature } from '../serialize-config/package-json.js';

const MERMAID_FENCE = /^ {0,3}```\s*mermaid\b/m;
const MATH_BLOCK = /\$\$[\s\S]+?\$\$/;
const MATH_INLINE = /(?<![A-Za-z0-9_])\$([^\s$][^$]*?[^\s$]|[^\s$])\$(?![A-Za-z0-9_])/;

export function detectFeatures(source: string): ReadonlySet<DetectedFeature> {
  const out = new Set<DetectedFeature>();
  if (MERMAID_FENCE.test(source)) {
    out.add('mermaid');
  }
  if (MATH_BLOCK.test(source) || MATH_INLINE.test(source)) {
    out.add('math');
  }
  if (sourceContainsGithubAlerts(source)) {
    out.add('github-alerts');
  }
  return out;
}

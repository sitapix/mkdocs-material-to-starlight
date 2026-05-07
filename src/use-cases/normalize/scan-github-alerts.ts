/**
 * Scanner: detect GitHub-style alert blockquotes (`> [!NOTE]`, `> [!TIP]`,
 * `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`) and emit one info
 * diagnostic per occurrence so users can find every affected file.
 *
 * Pure read (no text mutation). The actual transform — converting the alert
 * blockquote into a Starlight aside directive — is handled at build time by
 * the `starlight-github-alerts` plugin, which the package.json scaffolder
 * installs whenever any source file contains this pattern.
 *
 * The scanner is fence-shielded so alert markers inside ` ``` ` code blocks
 * are not falsely matched. Idempotent: running it twice produces the same
 * diagnostic set.
 */

import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { type LineScanner, runLineScanners } from '../../domain/scanners/line-scanner.js';
import { isFenceLine } from '../../domain/syntax/fence.js';

const ALERT_RE = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][-+]?(?:\s+.*)?\s*$/i;

function asideTypeFor(githubType: string): string {
  const upper = githubType.toUpperCase();
  if (upper === 'CAUTION') return 'danger';
  if (upper === 'WARNING') return 'caution';
  return upper.toLowerCase();
}

const githubAlertScanner: LineScanner = {
  ruleId: 'github-alert-detected',
  scan: (line, lineNumber) => {
    const match = ALERT_RE.exec(line);
    if (match === null) return null;
    const type = match[1] ?? '';
    const aside = asideTypeFor(type);
    return createDiagnostic({
      severity: 'info',
      ruleId: 'github-alert-detected',
      source: 'normalize/scan-github-alerts',
      message: `GitHub-style alert blockquote \`[!${type}]\` detected. Install \`starlight-github-alerts\` (added to package.json automatically) for native rendering, or convert manually to a Starlight aside (\`:::${aside}\`).`,
      place: { line: lineNumber, column: 1 },
    });
  },
};

export function scanGithubAlerts(source: string): ReadonlyArray<Diagnostic> {
  return runLineScanners(source, [githubAlertScanner]);
}

export function sourceContainsGithubAlerts(source: string): boolean {
  const lines = source.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (ALERT_RE.test(line)) return true;
  }
  return false;
}

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

const FENCE = /^ {0,3}(```|~~~)/;
const ALERT_RE = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/;

function asideTypeFor(githubType: string): string {
  if (githubType === 'CAUTION') return 'danger';
  if (githubType === 'WARNING') return 'caution';
  return githubType.toLowerCase();
}

export function scanGithubAlerts(source: string): ReadonlyArray<Diagnostic> {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split('\n');
  let inFence = false;
  let lineNumber = 0;

  for (const line of lines) {
    lineNumber += 1;
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = ALERT_RE.exec(line);
    if (match === null) continue;

    const type = match[1] ?? '';
    const aside = asideTypeFor(type);
    diagnostics.push(
      createDiagnostic({
        severity: 'info',
        ruleId: 'github-alert-detected',
        source: 'normalize/scan-github-alerts',
        message: `GitHub-style alert blockquote \`[!${type}]\` detected. Install \`starlight-github-alerts\` (added to package.json automatically) for native rendering, or convert manually to a Starlight aside (\`:::${aside}\`).`,
        place: { line: lineNumber, column: 1 },
      }),
    );
  }

  return diagnostics;
}

export function sourceContainsGithubAlerts(source: string): boolean {
  const lines = source.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (ALERT_RE.test(line)) return true;
  }
  return false;
}

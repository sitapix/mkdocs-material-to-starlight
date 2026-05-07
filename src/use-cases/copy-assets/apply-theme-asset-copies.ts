/**
 * Post-write copy of `theme.logo` and `theme.favicon` plus the diagnostics
 * we emit when the source file is missing or the favicon extension is
 * unsupported. Runs after the main asset-copy pass.
 *
 * Pulled out of `interface/api/convert-site.ts` so the orchestrator stays
 * under the size budget. Side-effecting (atomic copies + best-effort
 * re-write of `MIGRATION_NOTES.md` with an appended section) — that
 * matches how the inline code worked before. The orchestrator's contract
 * doesn't observe these diagnostics in its public output today; they
 * surface only via `MIGRATION_NOTES.md`.
 *
 * Failures here are non-fatal: the bulk-write phase has already produced
 * the converted site on disk, and a missing logo or favicon is a
 * documented diagnostic, not a hard error.
 */

import { join, posix } from 'node:path';
import { atomicCopyFile, atomicWriteText } from '../../infrastructure/fs/atomic-write.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const SOURCE = 'mkdocs-material-to-starlight';

export interface ThemeAssetCopyInput {
  readonly docsDir: string;
  readonly outputDir: string;
  /** Source-relative path of `theme.logo` if it exists on disk; null otherwise. */
  readonly logoSrc: string | null;
  /** Source-relative path of `theme.favicon` if it exists AND has an
   * accepted extension; null when missing or rejected. */
  readonly faviconRaw: string | null;
  /** Source-relative path of `theme.favicon` as declared (before
   * existence/extension filtering) — needed for the rejection diagnostic. */
  readonly faviconRawCandidate: string | null;
  /** True when the favicon extension is one Starlight rejects (.webp, .avif, …). */
  readonly faviconExtensionRejected: boolean;
  /** The current `MIGRATION_NOTES.md` source text — we append a section
   * to it when any asset diagnostic fires, then atomic-rewrite the file. */
  readonly migrationNotesSource: string;
}

interface TaggedDiagnostic {
  readonly sourcePath: string;
  readonly diagnostic: Diagnostic;
}

export async function applyThemeAssetCopies(input: ThemeAssetCopyInput): Promise<void> {
  const diagnostics: TaggedDiagnostic[] = [];

  if (input.faviconExtensionRejected && input.faviconRawCandidate !== null) {
    diagnostics.push({
      sourcePath: 'mkdocs.yml',
      diagnostic: createDiagnostic({
        severity: 'warning',
        ruleId: 'favicon-extension-unsupported',
        source: SOURCE,
        message:
          `theme.favicon: \`${input.faviconRawCandidate}\` uses an extension Starlight ` +
          `does not accept (allowed: .ico, .gif, .jpg/.jpeg, .png, .svg). The ` +
          `favicon was dropped from the generated astro.config.mjs so the build ` +
          `succeeds; Starlight falls back to its default chrome.`,
      }),
    });
  }

  // When the logo file doesn't exist on disk, skip emitting the `logo:`
  // config entry — Starlight's `logo.src` is resolved as a Vite import and
  // a missing file fails the build with "Rollup failed to resolve import".
  if (input.logoSrc !== null) {
    const logoCopy = await atomicCopyFile(
      join(input.docsDir, input.logoSrc),
      join(input.outputDir, 'src', 'assets', posix.basename(input.logoSrc)),
    );
    if (!logoCopy.ok) {
      diagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'logo-source-missing',
          source: SOURCE,
          message: `theme.logo: ${input.logoSrc} could not be located. ${logoCopy.error}`,
        }),
      });
    }
  }

  if (input.faviconRaw !== null) {
    const faviconCopy = await atomicCopyFile(
      join(input.docsDir, input.faviconRaw),
      join(input.outputDir, 'public', posix.basename(input.faviconRaw)),
    );
    if (!faviconCopy.ok) {
      diagnostics.push({
        sourcePath: 'mkdocs.yml',
        diagnostic: createDiagnostic({
          severity: 'warning',
          ruleId: 'favicon-source-missing',
          source: SOURCE,
          message: `theme.favicon: ${input.faviconRaw} could not be located. ${faviconCopy.error}`,
        }),
      });
    }
  }

  if (diagnostics.length > 0) {
    const extraSection =
      '\n## logo / favicon assets\n\n' +
      diagnostics
        .map((d) => `- **${d.sourcePath}** — ${d.diagnostic.ruleId}: ${d.diagnostic.message}`)
        .join('\n') +
      '\n';
    // Best-effort atomic re-write of MIGRATION_NOTES.md with the appended
    // post-write section. Failures here are non-fatal — the original notes
    // file is already on disk.
    await atomicWriteText(
      join(input.outputDir, 'MIGRATION_NOTES.md'),
      input.migrationNotesSource + extraSection,
    );
  }
}

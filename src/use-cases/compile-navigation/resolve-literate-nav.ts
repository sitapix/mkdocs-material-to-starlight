/**
 * Decide whether `mkdocs-literate-nav` is configured, and if so, parse
 * the project's `SUMMARY.md` into a navigation tree. Returns the parsed
 * nav (or null when disabled / SUMMARY.md missing) plus any diagnostics
 * the parser produced (or one acknowledging that the file couldn't be
 * read).
 */

import { join } from 'node:path';
import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import { createDiagnostic, type Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { parseLiterateNav } from '../config/parse-literate-nav.js';

export interface LiterateNavResult {
  readonly tree: ReadonlyArray<MkdocsNavEntry> | null;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

export async function resolveLiterateNav(
  plugins: ReadonlyArray<{ readonly name: string }>,
  docsDir: string,
  fs: FileSystem,
): Promise<LiterateNavResult> {
  const enabled = plugins.some((p) => p.name === 'literate-nav');
  if (!enabled) {
    return { tree: null, diagnostics: [] };
  }
  const summaryPath = join(docsDir, 'SUMMARY.md');
  const read = await fs.readText(summaryPath);
  if (!read.ok) {
    return {
      tree: null,
      diagnostics: [
        createDiagnostic({
          severity: 'warning',
          ruleId: 'plugin-literate-nav-no-summary',
          source: 'config/literate-nav',
          message: `mkdocs-literate-nav plugin enabled but ${summaryPath} could not be read; falling back to nav: in mkdocs.yml.`,
        }),
      ],
    };
  }
  const parsed = parseLiterateNav(read.value);
  return {
    tree: parsed.nav,
    diagnostics: [
      createDiagnostic({
        severity: 'info',
        ruleId: 'plugin-literate-nav-applied',
        source: 'config/literate-nav',
        message: `mkdocs-literate-nav: SUMMARY.md parsed (${parsed.nav.length} top-level entries) and used as the navigation source.`,
      }),
      ...parsed.diagnostics,
    ],
  };
}

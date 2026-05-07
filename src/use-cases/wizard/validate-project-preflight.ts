/**
 * Lightweight preflight validation for the wizard. Runs after the user
 * picks the project directory but BEFORE any prompt fires, so the wizard
 * fails fast on a misconfigured `docs_dir:` instead of asking 12 questions
 * the user can't act on.
 *
 * Mirrors the docs-dir validation done by `prepareConvertContext`, but
 * without the heavy I/O (no asset listing, no auto-append read) — this
 * runs in milliseconds and serves only to gate the prompt flow.
 *
 * Pure: takes the parsed config and a DirectoryReader port. No filesystem
 * imports here; the interface layer wires the production adapter.
 */

import { join } from 'node:path';
import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import type { DirectoryReader } from '../../domain/ports/directory-reader.js';
import { err, ok, type Result } from '../../domain/result.js';
import { enrichMissingDocsDirMessage } from '../convert-site/diagnostic-enrichment.js';

export type PreflightError =
  | { readonly kind: 'docs-dir-missing'; readonly message: string }
  | { readonly kind: 'docs-dir-empty'; readonly message: string };

export async function validateProjectPreflight(
  projectDir: string,
  config: MkdocsConfig,
  dirReader: DirectoryReader,
): Promise<Result<undefined, PreflightError>> {
  const docsDir = join(projectDir, config.docsDir);
  const listing = await dirReader.list(docsDir, ['.md', '.mdx']);
  if (!listing.ok) {
    // When docs_dir doesn't resolve, peek at the project root for stray
    // markdown — same heuristic prepareConvertContext uses to suggest the
    // legacy `docs_dir: .` layout fix. Reuses the shared enrichment helper
    // so the wizard error reads identically to the convert-time error.
    const configDirListing = await dirReader.list(projectDir, ['.md', '.mdx']);
    const configDirHasMarkdown = configDirListing.ok && configDirListing.value.length > 0;
    return err({
      kind: 'docs-dir-missing',
      message: enrichMissingDocsDirMessage(
        listing.error.message,
        config.plugins,
        configDirHasMarkdown
          ? {
              configDirHasMarkdown: true,
              configDirRelative: '.',
              configuredDocsDir: config.docsDir,
            }
          : undefined,
      ),
    });
  }
  if (listing.value.length === 0) {
    return err({
      kind: 'docs-dir-empty',
      message:
        `${docsDir} contains no .md or .mdx files. ` +
        `Check your mkdocs.yml \`docs_dir:\` setting (currently \`${config.docsDir}\`).`,
    });
  }
  return ok(undefined);
}

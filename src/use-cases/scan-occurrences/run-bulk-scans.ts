/**
 * Per-occurrence source scanners — runs every scan that walks the source
 * tree to surface diagnostics about patterns the converter cannot rewrite
 * (Material's `content.tabs.link`, codehilite linenums, `.no-copy` /
 * `.no-select` markers, alternate LaTeX delimiters, MathJax/KaTeX runtime
 * scripts, Material code-block CSS variables, `.meta.yml` cascade).
 *
 * Pulled out of `interface/api/convert-site.ts` so the orchestrator stays
 * under the size budget. Pure orchestration: every scan is itself pure;
 * this function just sequences the reads and the scan dispatch.
 *
 * Inputs are read-only; the function returns the aggregated diagnostic
 * list. The caller decides where to fold them into the bigger diagnostic
 * stream.
 */

import { join } from 'node:path';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type {
  MkdocsPlugin,
  MkdocsMarkdownExtension,
} from '../../domain/config/mkdocs-config.js';
import {
  scanCodeBlockOptOuts,
  scanCodehiliteLinenumsOccurrences,
  scanLatexDelimiters,
  scanMathScripts,
  scanMetaYmlFiles,
  scanTabsLinkOccurrences,
} from '../detect-features/scan-bulk-diagnostics.js';
import { scanMaterialCodeCssVars } from '../detect-features/scan-code-css-vars.js';
import type { TaggedDiagnostic } from '../convert-site/convert.js';

/** A directory reader that lists files in a docs tree, filtered by extension. */
export interface DirectoryReaderLike {
  list(
    dir: string,
    extensions: ReadonlyArray<string>,
  ): Promise<{ ok: true; value: ReadonlyArray<string> } | { ok: false; error: { message: string } }>;
}

export interface RunBulkScansInput {
  readonly docsDir: string;
  readonly projectDir: string;
  readonly fs: FileSystem;
  readonly dirReader: DirectoryReaderLike;
  /** Source-relative paths the converter is processing (post-exclude). */
  readonly sourcePaths: ReadonlyArray<string>;
  readonly plugins: ReadonlyArray<MkdocsPlugin>;
  readonly markdownExtensions: ReadonlyArray<MkdocsMarkdownExtension>;
  readonly hasTabsLink: boolean;
  readonly extraCssPaths: ReadonlyArray<string>;
  readonly extraJsPaths: ReadonlyArray<string>;
}

export async function runBulkScans(
  input: RunBulkScansInput,
): Promise<ReadonlyArray<TaggedDiagnostic>> {
  const { docsDir, projectDir, fs, dirReader, sourcePaths } = input;
  const out: TaggedDiagnostic[] = [];
  const hasCodehilite = input.markdownExtensions.some(
    (ext) => (typeof ext === 'string' ? ext : (Object.keys(ext)[0] ?? '')) === 'codehilite',
  );
  const hasMetaPlugin = input.plugins.some((p) => p.name === 'meta');

  // Read all source files once. The opt-out / no-copy scan always runs (it
  // doesn't depend on a plugin flag), so the read is unconditional now.
  const sourceEntries: Array<readonly [string, string]> = [];
  for (const relPath of sourcePaths) {
    const absPath = join(docsDir, relPath);
    const readResult = await fs.readText(absPath);
    if (!readResult.ok) continue;
    sourceEntries.push([relPath, readResult.value]);
  }

  if (input.hasTabsLink) {
    for (const d of scanTabsLinkOccurrences(sourceEntries)) out.push(d);
  }
  if (hasCodehilite) {
    for (const d of scanCodehiliteLinenumsOccurrences(sourceEntries)) out.push(d);
  }

  // Scan for .meta.yml files separately (they're not in sourcePaths which
  // only lists .md/.mdx).
  if (hasMetaPlugin) {
    const metaEntries: Array<readonly [string, string]> = [];
    const allDocFiles = await dirReader.list(docsDir, ['.yml', '.yaml']);
    if (allDocFiles.ok) {
      for (const relPath of allDocFiles.value) {
        if (!relPath.endsWith('.meta.yml')) continue;
        const absPath = join(docsDir, relPath);
        const readResult = await fs.readText(absPath);
        if (!readResult.ok) continue;
        metaEntries.push([relPath, readResult.value]);
      }
    }
    if (metaEntries.length > 0) {
      for (const d of scanMetaYmlFiles(metaEntries)) out.push(d);
    }
  }

  // Always scan for `.no-copy` / `.no-select` markers — per-block opt-out
  // from Material's content.code.copy / content.code.select that
  // ExpressiveCode has no per-block toggle for. The scanner emits a warning
  // per file so the silent drop is visible.
  for (const d of scanCodeBlockOptOuts(sourceEntries)) out.push(d);

  // Scan for Material's alternate LaTeX delimiters `\(...\)` / `\[...\]`.
  // remark-math (the auto-wired math pipeline) only recognizes $/$$, so
  // these would silently render as literal backslashes.
  for (const d of scanLatexDelimiters(sourceEntries)) out.push(d);

  // Scan extra_javascript paths for MathJax/KaTeX runtime config scripts.
  // Astro renders math at build time via rehype-katex; runtime scripts
  // are obsolete and may conflict with the rehype output.
  for (const d of scanMathScripts(input.extraJsPaths)) out.push(d);

  // Scan extra_css files for Material code-block customization that does
  // not survive the move to ExpressiveCode (Pygments token classes,
  // --md-code-* CSS variables). The CSS files live in docs_dir / project
  // root; we resolve relative to docs_dir first, then projectDir.
  const cssEntries: Array<readonly [string, string]> = [];
  for (const cssPath of input.extraCssPaths) {
    if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(cssPath)) continue; // skip CDN URLs
    const trimmed = cssPath.replace(/^\/+/, '');
    const docsRel = join(docsDir, trimmed);
    const docsRead = await fs.readText(docsRel);
    if (docsRead.ok) {
      cssEntries.push([trimmed, docsRead.value]);
      continue;
    }
    const projectRead = await fs.readText(join(projectDir, trimmed));
    if (projectRead.ok) cssEntries.push([trimmed, projectRead.value]);
  }
  for (const d of scanMaterialCodeCssVars(cssEntries)) out.push(d);

  return out;
}

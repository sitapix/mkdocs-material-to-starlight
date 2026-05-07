/**
 * Plan asset copies for the site converter.
 *
 * Pure: takes the list of all files discovered under `docs_dir` and the set of
 * extensions considered "markdown" (and therefore handled by the per-file
 * converter). Returns the subset that should be copied verbatim, paired with
 * their destination relative paths.
 *
 * Asset destinations preserve the source directory layout so links like
 * `./images/diagram.png` continue to resolve. The interface layer copies the
 * planned files to `outputDir/public/<destRelative>`.
 *
 * Pure planner; no I/O, no side effects. The actual copy operation lives in
 * the interface layer where node:fs is wired in.
 */

export interface AssetCopyPlanInput {
  readonly allFiles: ReadonlyArray<string>;
  readonly markdownExtensions: ReadonlyArray<string>;
  /**
   * Source-relative paths to skip from the public copy plan. Used to exclude
   * the theme logo and favicon, which the interface layer relocates into
   * `src/assets/` and `public/` (root) respectively.
   */
  readonly excludePaths?: ReadonlyArray<string>;
}

export interface AssetCopy {
  readonly sourceRelative: string;
  readonly destRelative: string;
}

export function planAssetCopies(input: AssetCopyPlanInput): ReadonlyArray<AssetCopy> {
  const lowercased = input.markdownExtensions.map((ext) => ext.toLowerCase());
  const excluded = new Set(input.excludePaths ?? []);
  const out: AssetCopy[] = [];
  for (const file of input.allFiles) {
    if (isMarkdown(file, lowercased)) {
      continue;
    }
    if (excluded.has(file)) {
      continue;
    }
    out.push({ sourceRelative: file, destRelative: file });
  }
  return out;
}

function isMarkdown(file: string, lowercaseExtensions: ReadonlyArray<string>): boolean {
  const lower = file.toLowerCase();
  return lowercaseExtensions.some((ext) => lower.endsWith(ext));
}

/**
 * Walk a list of source-relative paths and collect every distinct
 * directory prefix (including the empty string for the docs root).
 * Used as the candidate set for `.pages` file lookups in
 * awesome-pages, where each directory may carry its own override file.
 */

export function collectCandidateDirectories(
  sourcePaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const set = new Set<string>(['']);
  for (const path of sourcePaths) {
    let cursor = path.lastIndexOf('/');
    while (cursor !== -1) {
      set.add(path.slice(0, cursor));
      cursor = path.lastIndexOf('/', cursor - 1);
    }
  }
  return [...set];
}

/**
 * Resolve a PyMdown snippet path against an ordered list of `base_path` roots.
 *
 * Mirrors `pymdownx.snippets`'s first-match-wins semantics: each base_path is
 * tried in order, and the first one that contains the relative path wins.
 * If none does, a typed `SnippetNotFound` error is returned with the full
 * search list, so the caller can surface every attempted path in diagnostics.
 *
 * The resolver is pure given its FileSystem port. Tests inject an in-memory
 * map; production code injects a node:fs adapter from `infrastructure/fs`.
 */

import { ok, err, type Result } from '../../domain/result.js';
import type { FileSystem } from '../../domain/ports/file-system.js';

export interface SnippetResolveInput {
  readonly relativePath: string;
  readonly basePaths: ReadonlyArray<string>;
  readonly fs: FileSystem;
}

export interface ResolvedSnippet {
  readonly absolutePath: string;
  readonly content: string;
}

export interface SnippetNotFound {
  readonly code: 'snippet-not-found';
  readonly relativePath: string;
  readonly searched: ReadonlyArray<string>;
}

export async function resolveSnippet(
  input: SnippetResolveInput,
): Promise<Result<ResolvedSnippet, SnippetNotFound>> {
  const searched: string[] = [];
  for (const base of input.basePaths) {
    const candidate = joinPath(base, input.relativePath);
    searched.push(candidate);
    const read = await input.fs.readText(candidate);
    if (read.ok) {
      return ok({ absolutePath: candidate, content: read.value });
    }
  }
  return err({
    code: 'snippet-not-found',
    relativePath: input.relativePath,
    searched,
  });
}

function joinPath(base: string, rel: string): string {
  if (base.length === 0) {
    return rel;
  }
  return base.endsWith('/') ? `${base}${rel}` : `${base}/${rel}`;
}

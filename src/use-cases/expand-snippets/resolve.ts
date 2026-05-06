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

import type { FileSystem } from '../../domain/ports/file-system.js';
import { err, ok, type Result } from '../../domain/result.js';
import { safeResolveWithin } from '../safety/safe-resolve.js';

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
  readonly code: 'snippet-not-found' | 'snippet-path-unsafe';
  readonly relativePath: string;
  readonly searched: ReadonlyArray<string>;
  /** Set when `code === 'snippet-path-unsafe'`: the base directory whose
   *  containment check the candidate failed. */
  readonly unsafeBase?: string;
}

export async function resolveSnippet(
  input: SnippetResolveInput,
): Promise<Result<ResolvedSnippet, SnippetNotFound>> {
  const searched: string[] = [];
  for (const base of input.basePaths) {
    const candidate = joinPath(base, input.relativePath);
    searched.push(candidate);
    // Containment check: realpath both base and candidate, ensure the
    // resolved candidate is anchored at the resolved base. Rejects symlink
    // escapes (`docs/snippets/secret-link → /etc/passwd`) and `..` traversal
    // in user-controlled snippet directives. We only enforce when the
    // candidate exists on disk — non-existent candidates are a normal
    // miss-and-try-next-base path.
    if (await input.fs.exists(candidate)) {
      const safe = await safeResolveWithin(base, candidate, input.fs);
      if (!safe.ok) {
        if (safe.error.code === 'path-escapes-base') {
          return err({
            code: 'snippet-path-unsafe',
            relativePath: input.relativePath,
            searched,
            unsafeBase: base,
          });
        }
        // base-not-resolvable / candidate-not-resolvable: treat as miss.
        continue;
      }
      const read = await input.fs.readText(safe.value);
      if (read.ok) {
        return ok({ absolutePath: safe.value, content: read.value });
      }
    }
    // Candidate doesn't exist on disk in this base; fall through to next.
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

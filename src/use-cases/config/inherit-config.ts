/**
 * Resolve MkDocs `INHERIT:` directives by inlining the referenced YAML
 * before decoding.
 *
 * MkDocs (since 1.5) treats a top-level `INHERIT:` key as a deep-merge base
 * config. The value is a path resolved relative to the config file location.
 * Multiple levels of INHERIT chain transitively.
 *
 * For our purposes (we don't need MkDocs's full deep-merge semantics; the
 * downstream parser tolerates duplicate top-level keys with later values
 * winning), inlining the base file's content above the deriver's content
 * is sufficient.
 *
 * Pure given the FileSystem port. Returns the inlined source plus tracking
 * info (included files for diagnostics, missing references for warnings).
 */

import type { FileSystem } from '../../domain/ports/file-system.js';

const INHERIT_RE = /^INHERIT:\s*(\S+)\s*$/m;
const MAX_DEPTH = 8;

export interface ResolveInheritsResult {
  readonly source: string;
  readonly included: ReadonlyArray<string>;
  readonly missing: ReadonlyArray<string>;
}

export async function resolveInherits(
  source: string,
  configFilePath: string,
  fs: FileSystem,
): Promise<ResolveInheritsResult> {
  const included: string[] = [];
  const missing: string[] = [];
  const result = await expand(source, configFilePath, fs, included, missing, 0);
  return { source: result, included, missing };
}

async function expand(
  source: string,
  fromFile: string,
  fs: FileSystem,
  included: string[],
  missing: string[],
  depth: number,
): Promise<string> {
  if (depth >= MAX_DEPTH) return source;
  const match = source.match(INHERIT_RE);
  if (match === null) return source;
  const relativePath = match[1] ?? '';
  const absolutePath = resolveRelative(fromFile, relativePath);
  const read = await fs.readText(absolutePath);
  const remainder = source.replace(INHERIT_RE, '').trimStart();
  if (!read.ok) {
    missing.push(absolutePath);
    return remainder;
  }
  included.push(absolutePath);
  const expandedBase = await expand(
    read.value,
    absolutePath,
    fs,
    included,
    missing,
    depth + 1,
  );
  return `${expandedBase.trimEnd()}\n${remainder}`;
}

function resolveRelative(fromFile: string, relPath: string): string {
  const dir = fromFile.slice(0, fromFile.lastIndexOf('/'));
  const segments = `${dir}/${relPath}`.split('/');
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === '' && stack.length === 0) {
      stack.push('');
      continue;
    }
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join('/');
}

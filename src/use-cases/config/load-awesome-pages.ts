/**
 * Load `.pages` files from disk for the awesome-pages integration.
 *
 * Walks each candidate directory under `docsDir` and, if a `.pages` file is
 * present, parses it via `parseAwesomePages`. Returns a map keyed by the
 * directory's relative path (with `''` for `docsDir` itself).
 *
 * Pure given its injected ports — takes a `FileSystem` and a `YamlDecoder`,
 * returns a `Result`. Tests inject in-memory adapters; production wires the
 * node:fs and js-yaml implementations from `infrastructure/`.
 *
 * Missing `.pages` files are not errors — they simply produce no entry. Only
 * malformed YAML or invalid `.pages` shape produces a typed error.
 */

import type { AwesomePagesConfig } from '../../domain/config/awesome-pages.js';
import type { FileSystem } from '../../domain/ports/file-system.js';
import type { YamlDecoder } from '../../domain/ports/yaml-decoder.js';
import { err, ok, type Result } from '../../domain/result.js';
import { parseAwesomePages } from './parse-awesome-pages.js';

export interface LoadAwesomePagesInput {
  readonly docsDir: string;
  readonly candidateDirectories: ReadonlyArray<string>;
  readonly fs: FileSystem;
  readonly yaml: YamlDecoder;
}

export interface AwesomePagesLoadError {
  readonly directory: string;
  readonly message: string;
}

export type AwesomePagesMap = ReadonlyMap<string, AwesomePagesConfig>;

export async function loadAwesomePagesFiles(
  input: LoadAwesomePagesInput,
): Promise<Result<AwesomePagesMap, AwesomePagesLoadError>> {
  const out = new Map<string, AwesomePagesConfig>();
  for (const directory of input.candidateDirectories) {
    const path = joinPath(input.docsDir, directory, '.pages');
    const read = await input.fs.readText(path);
    if (!read.ok) {
      continue;
    }
    const decoded = input.yaml.decode(read.value);
    if (!decoded.ok) {
      return err({ directory, message: decoded.error.message });
    }
    const parsed = parseAwesomePages(decoded.value);
    if (!parsed.ok) {
      return err({ directory, message: parsed.error.message });
    }
    out.set(directory, parsed.value);
  }
  return ok(out);
}

function joinPath(...parts: ReadonlyArray<string>): string {
  return parts.filter((p) => p.length > 0).join('/');
}

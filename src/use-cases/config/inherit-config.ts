/**
 * Resolve MkDocs `INHERIT:` directives by deep-merging the referenced YAML
 * config objects.
 *
 * MkDocs 1.5+ treats a top-level `INHERIT:` key as a deep-merge base config.
 * The value resolves relative to the config file. Multiple `INHERIT:` levels
 * chain transitively.
 *
 * Merge semantics (matching MkDocs):
 *   - Same-key plain objects recurse.
 *   - Otherwise derived wins outright. Arrays do NOT merge element-wise —
 *     derived replaces base.
 *   - Base-only and derived-only keys both pass through.
 *
 * The merged object re-encodes via `js-yaml.dump` so downstream sees a
 * clean, duplicate-free string. Pure given FileSystem; tracks included
 * files for diagnostics and missing references for warnings.
 */

import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import type { FileSystem } from '../../domain/ports/file-system.js';
import { preprocessMkdocsEnvTags } from './preprocess-mkdocs-env-tags.js';
import { preprocessMkdocsPythonTags } from './preprocess-mkdocs-python-tags.js';

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
  const expandedBase = await expand(read.value, absolutePath, fs, included, missing, depth + 1);

  // Deep-merge: parse both YAML strings into JS objects, merge at the
  // object level, then re-encode to a clean YAML string free of duplicate keys.
  return mergeYamlSources(expandedBase, remainder);
}

/**
 * Parse two YAML strings, deep-merge them (derived wins on conflicts, arrays
 * are replaced not concatenated), and re-encode the result.
 *
 * Falls back to the string-concatenation approach only when one or both sides
 * cannot be parsed as a mapping (e.g., an empty file or a scalar root).
 */
function stripCustomTags(source: string): string {
  return preprocessMkdocsPythonTags(preprocessMkdocsEnvTags(source)).source;
}

function mergeYamlSources(baseSource: string, derivedSource: string): string {
  let baseObj: unknown;
  let derivedObj: unknown;
  try {
    const baseStripped = stripCustomTags(baseSource);
    const derivedStripped = stripCustomTags(derivedSource);
    baseObj = baseStripped.trim().length === 0 ? {} : yamlLoad(baseStripped);
    derivedObj = derivedStripped.trim().length === 0 ? {} : yamlLoad(derivedStripped);
  } catch {
    // If either side is not parseable YAML at this point, fall back to the
    // old concatenation so downstream gets the raw error rather than a silent
    // merge failure.
    return `${baseSource.trimEnd()}\n${derivedSource}`;
  }

  if (!isPlainObject(baseObj) || !isPlainObject(derivedObj)) {
    // Non-mapping roots (arrays, scalars) cannot be deep-merged; concatenate
    // and let downstream handle the error.
    return `${baseSource.trimEnd()}\n${derivedSource}`;
  }

  const merged = deepMerge(baseObj, derivedObj);
  return yamlDump(merged, { lineWidth: -1, noRefs: true });
}

/**
 * Deep-merge two plain objects. Derived wins on scalar/array conflicts.
 * Both values must be plain objects for recursive merging to apply.
 */
function deepMerge(
  base: Record<string, unknown>,
  derived: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(derived)) {
    const baseVal = result[key];
    const derivedVal = derived[key];
    if (isPlainObject(baseVal) && isPlainObject(derivedVal)) {
      result[key] = deepMerge(baseVal, derivedVal);
    } else {
      result[key] = derivedVal;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
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

/**
 * Walk a YAML-decoded `nav` array and produce a typed tree of `MkdocsNavEntry`
 * nodes. Pure function — no I/O, no slug resolution, no sidebar synthesis.
 *
 * Each YAML entry must take one of these shapes:
 *   - string                        — bare filename (no title override)
 *   - { 'Title': 'page.md' }        — titled file
 *   - { 'Title': 'https://...' }    — external link (URL detected by scheme)
 *   - { 'Title': [ ...children ] }  — section with nested entries
 *
 * Entries with multiple keys, or values that are neither string nor list, are
 * rejected as a `Result.err`. The caller decides whether to abort the run or
 * surface the failure as a diagnostic and skip the entry.
 */

import type { MkdocsNavEntry } from '../../domain/config/mkdocs-config.js';
import { err, ok, type Result } from '../../domain/result.js';

export interface NavParseError {
  readonly message: string;
  readonly path: ReadonlyArray<number>;
}

export function parseNavTree(
  raw: ReadonlyArray<unknown>,
): Result<ReadonlyArray<MkdocsNavEntry>, NavParseError> {
  return parseEntries(raw, []);
}

function parseEntries(
  raw: ReadonlyArray<unknown>,
  path: ReadonlyArray<number>,
): Result<ReadonlyArray<MkdocsNavEntry>, NavParseError> {
  const out: MkdocsNavEntry[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const here = [...path, i];
    const entryResult = parseEntry(raw[i], here);
    if (!entryResult.ok) {
      return entryResult;
    }
    out.push(entryResult.value);
  }
  return ok(out);
}

function parseEntry(
  value: unknown,
  path: ReadonlyArray<number>,
): Result<MkdocsNavEntry, NavParseError> {
  if (typeof value === 'string') {
    return ok({ kind: 'file', title: null, path: value });
  }
  if (!isPlainObject(value)) {
    return err({
      message: 'nav entry must be a string or single-key map',
      path,
    });
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    return err({ message: 'nav map entries must have exactly one key', path });
  }
  const title = keys[0] ?? '';
  const child = value[title];

  if (typeof child === 'string') {
    return ok(
      isExternalUrl(child)
        ? { kind: 'external', title, href: sanitizeExternalUrl(child) }
        : { kind: 'file', title, path: child },
    );
  }

  if (Array.isArray(child)) {
    const childrenResult = parseEntries(child, path);
    return childrenResult.ok
      ? ok({ kind: 'section', title, children: childrenResult.value })
      : childrenResult;
  }

  return err({
    message: 'nav entry value must be a string or list',
    path,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strip trailing junk from a YAML-supplied external URL. Real-world Material
 * sites occasionally embed HTML attributes directly in nav values (e.g.
 * `https://example.com/page" target="_blank` from PowerTools) because YAML
 * does not require quoting and the author's editor auto-completed the link.
 * The resulting "URL" pollutes the rendered sidebar and breaks any URL
 * validator. Truncate at the first whitespace or `"` since neither is a
 * valid URL character per RFC 3986.
 */
function sanitizeExternalUrl(href: string): string {
  const m = href.match(/^[^\s"'<>]+/);
  return m === null ? href : m[0];
}

function isExternalUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('mailto:');
}

/**
 * Parse a YAML-decoded plain object into a typed `MkdocsConfig`.
 *
 * Pure: takes a `unknown`, returns `Result<MkdocsConfig, ConfigError>`. The
 * function does not read files, does not run YAML parsing — that lives in
 * `infrastructure/yaml`. Keeping the parser pure means it is trivially
 * testable without fixtures and reusable from callers that already have a
 * decoded object (tests, other tooling, programmatic API).
 *
 * Unknown top-level keys are preserved in `extras` so the navigation compiler
 * can surface them in MIGRATION_NOTES.md without losing information. The
 * structure of `nav` itself is left as raw entries here; `parseNavTree`
 * walks them separately to produce a typed tree.
 */

import { ok, err, type Result } from '../../domain/result.js';
import type {
  MkdocsConfig,
  MkdocsMarkdownExtension,
  MkdocsNavEntry,
  MkdocsPlugin,
  MkdocsTheme,
} from '../../domain/config/mkdocs-config.js';

export interface ConfigError {
  readonly message: string;
}

const KNOWN_KEYS: ReadonlySet<string> = new Set([
  'site_name',
  'site_description',
  'site_url',
  'docs_dir',
  'use_directory_urls',
  'repo_url',
  'repo_name',
  'edit_uri',
  'copyright',
  'theme',
  'nav',
  'plugins',
  'markdown_extensions',
]);

export function parseMkdocsConfig(raw: unknown): Result<MkdocsConfig, ConfigError> {
  if (!isPlainObject(raw)) {
    return err({ message: 'mkdocs config must be a YAML mapping (object)' });
  }

  const siteName = raw['site_name'];
  if (typeof siteName !== 'string') {
    return err({ message: 'site_name is required and must be a string' });
  }
  // Empty string is accepted (kedro.yml uses `site_name: ""` and injects the
  // title via overrides). Downstream consumers can fall back to a default.

  return ok({
    siteName,
    siteDescription: stringOrNull(raw['site_description']),
    siteUrl: stringOrNull(raw['site_url']),
    docsDir: typeof raw['docs_dir'] === 'string' ? raw['docs_dir'] : 'docs',
    useDirectoryUrls:
      typeof raw['use_directory_urls'] === 'boolean' ? raw['use_directory_urls'] : true,
    repoUrl: stringOrNull(raw['repo_url']),
    repoName: stringOrNull(raw['repo_name']),
    editUri: stringOrNull(raw['edit_uri']),
    copyright: stringOrNull(raw['copyright']),
    theme: parseTheme(raw['theme']),
    nav: parseRawNav(raw['nav']),
    plugins: parseList(raw['plugins'], (entry) => entry satisfies MkdocsPlugin),
    markdownExtensions: parseList(
      raw['markdown_extensions'],
      (entry) => entry satisfies MkdocsMarkdownExtension,
    ),
    extras: collectExtras(raw),
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseTheme(value: unknown): MkdocsTheme | null {
  if (typeof value === 'string') {
    return { name: value, options: {} };
  }
  if (!isPlainObject(value)) {
    return null;
  }
  const name = value['name'];
  if (typeof name !== 'string') {
    return null;
  }
  const { name: _name, ...options } = value;
  return { name, options };
}

function parseList<T extends MkdocsPlugin | MkdocsMarkdownExtension>(
  value: unknown,
  _checker: (entry: T) => T,
): ReadonlyArray<T> {
  // MkDocs accepts both array form (`plugins: [- a, - {b: ...}]`) and the
  // mapping form (`plugins:\n  a:\n  b: {...}`). The mapping form is common
  // in Tiangolo's template (FastAPI/Typer). Normalize the mapping into the
  // same array shape downstream code expects.
  if (isPlainObject(value)) {
    const out: T[] = [];
    for (const [name, opts] of Object.entries(value)) {
      out.push({
        name,
        options: isPlainObject(opts) ? opts : {},
      } as T);
    }
    return out;
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const out: T[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      out.push({ name: entry, options: {} } as T);
      continue;
    }
    if (isPlainObject(entry)) {
      const keys = Object.keys(entry);
      if (keys.length === 1) {
        const name = keys[0] ?? '';
        const opts = entry[name];
        out.push({
          name,
          options: isPlainObject(opts) ? opts : {},
        } as T);
      }
    }
  }
  return out;
}

function parseRawNav(value: unknown): ReadonlyArray<MkdocsNavEntry> | null {
  return Array.isArray(value) ? (value as ReadonlyArray<MkdocsNavEntry>) : null;
}

function collectExtras(raw: Record<string, unknown>): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_KEYS.has(key)) {
      extras[key] = value;
    }
  }
  return extras;
}

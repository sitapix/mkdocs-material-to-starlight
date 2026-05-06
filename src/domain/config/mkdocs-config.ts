/**
 * Typed shape of a Material for MkDocs `mkdocs.yml` document.
 *
 * Pure types — no I/O, no parser. The parser lives in use-cases and produces
 * one of these records (plus diagnostics) from a YAML-decoded plain object.
 *
 * Only the subset relevant to a Starlight migration is modeled. Unknown
 * top-level keys are preserved in `extras` so the navigation compiler can
 * surface them in MIGRATION_NOTES without losing information.
 */

export interface MkdocsConfig {
  readonly siteName: string;
  readonly siteDescription: string | null;
  readonly siteUrl: string | null;
  readonly docsDir: string;
  readonly useDirectoryUrls: boolean;
  readonly repoUrl: string | null;
  /**
   * Display label for the repository button. Material renders this next to
   * the repo icon; Starlight surfaces it as the `social: [{ label }]` entry
   * for the repo platform. When null, the converter falls back to the host
   * platform name (e.g. "GitHub").
   */
  readonly repoName: string | null;
  readonly editUri: string | null;
  /** Top-level `copyright:` text. Surfaced as a Footer-override diagnostic. */
  readonly copyright: string | null;
  readonly theme: MkdocsTheme | null;
  readonly nav: ReadonlyArray<MkdocsNavEntry> | null;
  readonly plugins: ReadonlyArray<MkdocsPlugin>;
  readonly markdownExtensions: ReadonlyArray<MkdocsMarkdownExtension>;
  readonly extras: Readonly<Record<string, unknown>>;
}

export interface MkdocsTheme {
  readonly name: string;
  readonly options: Readonly<Record<string, unknown>>;
}

/**
 * A nav entry in mkdocs.yml is one of four shapes:
 *
 *   - 'index.md'                                  → FileEntry (no title override)
 *   - { 'Title': 'page.md' }                      → FileEntry (titled)
 *   - { 'Section': [ ...children ] }              → SectionEntry
 *   - { 'External': 'https://example.com' }       → ExternalEntry
 *
 * The parser distinguishes them by the value type after key extraction.
 */
export type MkdocsNavEntry = FileEntry | SectionEntry | ExternalEntry;

export interface FileEntry {
  readonly kind: 'file';
  readonly title: string | null;
  readonly path: string;
}

export interface SectionEntry {
  readonly kind: 'section';
  readonly title: string;
  readonly children: ReadonlyArray<MkdocsNavEntry>;
}

interface ExternalEntry {
  readonly kind: 'external';
  readonly title: string;
  readonly href: string;
}

export interface MkdocsPlugin {
  readonly name: string;
  readonly options: Readonly<Record<string, unknown>>;
}

export interface MkdocsMarkdownExtension {
  readonly name: string;
  readonly options: Readonly<Record<string, unknown>>;
}

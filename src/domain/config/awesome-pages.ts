/**
 * Typed shape of an `awesome-pages` `.pages` file.
 *
 * The `.pages` plugin sits in each documentation directory and overrides how
 * children appear in the navigation — rename the section, reorder entries,
 * collapse single-page directories, hide entries entirely.
 *
 * Pure types. The parser turns YAML-decoded objects into these records.
 */

export interface AwesomePagesConfig {
  readonly title: string | null;
  readonly nav: ReadonlyArray<AwesomePagesNavEntry> | null;
  readonly collapse: boolean | null;
  readonly hide: boolean;
}

/**
 * Each nav entry inside a `.pages` file is one of:
 *   - a literal filename or directory name              ("intro.md", "advanced")
 *   - a "rest" placeholder ("...") that absorbs everything not explicitly listed
 *   - a single-key map { 'Title': 'page.md' } overriding the display title
 */
export type AwesomePagesNavEntry =
  | { readonly kind: 'literal'; readonly name: string }
  | { readonly kind: 'rest' }
  | { readonly kind: 'titled'; readonly title: string; readonly name: string };

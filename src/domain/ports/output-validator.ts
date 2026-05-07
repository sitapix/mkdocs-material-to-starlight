/**
 * Port — validate that a converted output file (`.md` or `.mdx`) parses
 * cleanly under the same parser Astro/Starlight uses at build time.
 *
 * The converter's pipeline knows it produces structurally-correct mdast,
 * but the SERIALIZED output passes through `remark-stringify` and several
 * post-stringify rewrites; subtle escapes or MDX-specific syntax gotchas
 * can slip in. Without this port, the only way users find those is by
 * running `astro build` and seeing the parse error in production.
 *
 * The implementation lives in `infrastructure/mdx/` and lazy-imports
 * `@mdx-js/mdx` (the same package Astro uses) for `.mdx`. For `.md` it
 * uses `unified` + `remark-parse` + `remark-frontmatter` + `remark-gfm`
 * + `remark-directive` — Starlight's parsing pipeline.
 */

interface OutputValidationFailure {
  /** 1-based line number of the failure, or null if unknown. */
  readonly line: number | null;
  /** 1-based column, or null if unknown. */
  readonly column: number | null;
  /** Single-line human-readable error message. */
  readonly message: string;
}

export type OutputValidationResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'failure'; readonly errors: ReadonlyArray<OutputValidationFailure> }
  | { readonly kind: 'driver-missing'; readonly hint: string };

export interface OutputValidator {
  validate(text: string, extension: 'md' | 'mdx'): Promise<OutputValidationResult>;
}

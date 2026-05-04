/**
 * Material for MkDocs admonition type qualifiers.
 *
 * The 12 canonical types defined in the Material reference, plus the 14
 * deprecated-but-widespread aliases Material's docs warn will be removed
 * in the next major version (`summary`, `tldr`, `hint`, `important`,
 * `check`, `done`, `help`, `faq`, `caution`, `attention`, `fail`,
 * `missing`, `error`, `cite`). Aliases resolve to their canonical type and
 * are flagged via `isAlias` so callers can preserve the original spelling
 * in diagnostics. Unknown qualifiers fall back to "note".
 */

export const ADMONITION_TYPES = [
  'note',
  'abstract',
  'info',
  'tip',
  'success',
  'question',
  'warning',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
] as const;

export type AdmonitionType = (typeof ADMONITION_TYPES)[number];

/**
 * Documented Material deprecated aliases → canonical type.
 * Each row mirrors a row from the Material admonitions reference.
 */
const ALIASES: Readonly<Record<string, AdmonitionType>> = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
};

export interface ParsedAdmonitionType {
  readonly type: AdmonitionType;
  readonly isFallback: boolean;
  readonly isAlias?: boolean;
  readonly original: string;
}

const RECOGNIZED: ReadonlySet<string> = new Set(ADMONITION_TYPES);

export function parseAdmonitionType(qualifier: string): ParsedAdmonitionType {
  if (RECOGNIZED.has(qualifier)) {
    return { type: qualifier as AdmonitionType, isFallback: false, original: qualifier };
  }
  const aliased = ALIASES[qualifier];
  if (aliased !== undefined) {
    return { type: aliased, isFallback: false, isAlias: true, original: qualifier };
  }
  return { type: 'note', isFallback: true, original: qualifier };
}

/**
 * Material for MkDocs admonition type qualifiers.
 *
 * The 12 types defined in the Material reference. Unknown qualifiers fall back
 * to "note" per the upstream specification, but the original token is preserved
 * so callers can emit a diagnostic.
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

export interface ParsedAdmonitionType {
  readonly type: AdmonitionType;
  readonly isFallback: boolean;
  readonly original: string;
}

const RECOGNIZED: ReadonlySet<string> = new Set(ADMONITION_TYPES);

export function parseAdmonitionType(qualifier: string): ParsedAdmonitionType {
  if (RECOGNIZED.has(qualifier)) {
    return { type: qualifier as AdmonitionType, isFallback: false, original: qualifier };
  }
  return { type: 'note', isFallback: true, original: qualifier };
}

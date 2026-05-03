/**
 * Map Material for MkDocs admonition types to Starlight aside descriptors.
 *
 * Starlight has four aside types (note, tip, caution, danger). Material has
 * twelve. The mapping below preserves visual intent: warnings become caution,
 * failures and bugs become danger, success becomes tip with a check icon, and
 * the "quote" type leaves the aside system entirely and becomes a blockquote.
 *
 * The function is total: every member of `AdmonitionType` produces a defined
 * descriptor. This is a pure value transformation with no I/O.
 */

import type { AdmonitionType } from '../../domain/syntax/admonition-type.js';
import type { StarlightAsideType } from '../../domain/starlight/aside-type.js';

export interface AsideDescriptor {
  readonly asideType: StarlightAsideType;
  readonly iconHint?: string;
}

export interface BlockquoteDescriptor {
  readonly renderAsBlockquote: true;
}

export type MappedAdmonition = AsideDescriptor | BlockquoteDescriptor;

const TABLE: Readonly<Record<AdmonitionType, MappedAdmonition>> = {
  note: { asideType: 'note' },
  abstract: { asideType: 'note', iconHint: 'document' },
  info: { asideType: 'note', iconHint: 'information' },
  tip: { asideType: 'tip' },
  success: { asideType: 'tip', iconHint: 'approve-check' },
  question: { asideType: 'note', iconHint: 'comment-alt' },
  warning: { asideType: 'caution' },
  failure: { asideType: 'danger' },
  danger: { asideType: 'danger' },
  bug: { asideType: 'danger', iconHint: 'bars' },
  example: { asideType: 'note', iconHint: 'puzzle' },
  quote: { renderAsBlockquote: true },
};

export function mapAdmonitionToAside(type: AdmonitionType): MappedAdmonition {
  return TABLE[type];
}

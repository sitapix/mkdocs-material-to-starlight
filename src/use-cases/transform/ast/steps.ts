/**
 * Text-level pre-parse transformer for Starlight `<Steps>` promotion.
 *
 * Detects top-level ordered lists that look like tutorial steps and wraps
 * them in `<Steps>...</Steps>` MDX tags.
 *
 * DETECTION HEURISTIC (conservative — false positives are worse than misses):
 * A top-level ordered list is promoted ONLY when ALL hold:
 *   1. >= 3 items.
 *   2. Each item is multi-line (has content beyond its opening line).
 *   3. The list is preceded (within 5 lines) by a tutorial-style heading.
 *   4. The list is NOT already inside a <Steps> block (idempotency guard).
 *
 * Pure function: text -> { text, promoted, diagnostics }. No I/O.
 */

import { createDiagnostic, type Diagnostic } from '../../../domain/diagnostics/diagnostic.js';

export interface StepsResult {
  readonly text: string;
  readonly promoted: boolean;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
}

const TUTORIAL_KEYWORDS_RE =
  /\b(step|steps|tutorial|getting\s+started|guide)\b/i;

const TUTORIAL_VERB_RE =
  /^(?:setup|install|create|build|configure|add|deploy|run)\b/i;

function isTutorialHeading(headingText: string): boolean {
  if (TUTORIAL_KEYWORDS_RE.test(headingText)) return true;
  const stripped = headingText.trim().replace(/^[^a-z]*/i, '');
  return TUTORIAL_VERB_RE.test(stripped);
}

import { isFenceLine } from '../../../domain/syntax/fence.js';

const HEADING_RE = /^#{1,6} (.+)$/;
const OL_ITEM_RE = /^(\d+)\. /;

interface OrderedListSpan {
  readonly start: number;
  readonly end: number;
  readonly items: ReadonlyArray<ReadonlyArray<string>>;
}

function readOrderedList(
  lines: ReadonlyArray<string>,
  startIdx: number,
): OrderedListSpan | null {
  if (!OL_ITEM_RE.test(lines[startIdx] ?? '')) return null;

  const items: string[][] = [];
  let current: string[] = [];
  let i = startIdx;
  let inFence = false;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (isFenceLine(line)) {
      inFence = !inFence;
      current.push(line);
      i += 1;
      continue;
    }
    if (inFence) {
      current.push(line);
      i += 1;
      continue;
    }

    if (OL_ITEM_RE.test(line)) {
      if (current.length > 0) items.push(current);
      current = [line];
      i += 1;
      continue;
    }

    if (line.trim().length === 0) {
      const next = lines[i + 1] ?? '';
      if (
        next.trim().length === 0 ||
        OL_ITEM_RE.test(next) ||
        /^ {3,}/.test(next)
      ) {
        current.push(line);
        i += 1;
        continue;
      }
      break;
    }

    if (/^ {3,}/.test(line)) {
      current.push(line);
      i += 1;
      continue;
    }

    break;
  }

  if (current.length > 0) items.push(current);
  if (items.length === 0) return null;

  return { start: startIdx, end: i, items };
}

function isMultiLineItem(item: ReadonlyArray<string>): boolean {
  const nonBlank = item.filter((l) => l.trim().length > 0);
  return nonBlank.length >= 2;
}

function precedingTutorialHeading(
  lines: ReadonlyArray<string>,
  listStart: number,
): boolean {
  const lookBack = Math.max(0, listStart - 5);
  for (let i = lookBack; i < listStart; i += 1) {
    const line = lines[i] ?? '';
    const m = HEADING_RE.exec(line);
    if (m !== null) {
      return isTutorialHeading(m[1] ?? '');
    }
  }
  return false;
}

export function promoteSteps(source: string): StepsResult {
  if (source.includes('<Steps>')) {
    return { text: source, promoted: false, diagnostics: [] };
  }

  const lines = source.split('\n');
  const replacements: Array<{ start: number; end: number; replacement: string[] }> = [];
  const diagnostics: Diagnostic[] = [];

  let i = 0;
  while (i < lines.length) {
    const list = readOrderedList(lines, i);
    if (list === null) {
      i += 1;
      continue;
    }

    const qualifies =
      list.items.length >= 3 &&
      list.items.every(isMultiLineItem) &&
      precedingTutorialHeading(lines, list.start);

    if (qualifies) {
      const listLines = lines.slice(list.start, list.end);
      // The blank line before `</Steps>` is load-bearing. Without it,
      // CommonMark parses the closer as belonging to the last list item's
      // continuation; remark-stringify then re-emits it indented at the
      // item's column, and MDX rejects the misaligned closing tag.
      // (DDEV `users/topics/sharing.md` regression.)
      const trailing = listLines[listLines.length - 1] ?? '';
      const padded = trailing.trim().length === 0 ? listLines : [...listLines, ''];
      const replacement = ['<Steps>', '', ...padded, '</Steps>'];
      replacements.push({ start: list.start, end: list.end, replacement });
      diagnostics.push(
        createDiagnostic({
          severity: 'info',
          ruleId: 'ordered-list-promoted-to-steps',
          source: 'transform/ast/steps',
          message: `Ordered list with ${list.items.length} items promoted to <Steps> component.`,
        }),
      );
    }

    i = list.end;
  }

  if (replacements.length === 0) {
    return { text: source, promoted: false, diagnostics: [] };
  }

  const outLines = [...lines];
  for (const r of [...replacements].reverse()) {
    outLines.splice(r.start, r.end - r.start, ...r.replacement);
  }

  return {
    text: outLines.join('\n'),
    promoted: true,
    diagnostics,
  };
}

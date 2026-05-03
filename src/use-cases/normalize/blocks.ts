/**
 * Pre-parse normalizer: rewrite `pymdownx.blocks.*` fenced blocks into
 * remark-directive container syntax. Pure text → text, no AST involved.
 *
 * Material for MkDocs is moving away from indentation-sensitive admonition
 * syntax (`!!! note`, `??? details`, `=== "Tab"`) to the unified
 * `pymdownx.blocks.*` family of fenced blocks:
 *
 *   /// note | Title
 *   body
 *   ///
 *
 * Like fenced code, the closing fence must use the same number of slashes as
 * the opener (>= 3). Body lines do **not** need to be indented; the fence
 * delimiter alone scopes the block. This normalizer recognizes the fenced
 * form and emits the equivalent `:::name[Title]` ... `:::` directive markup,
 * which the unified pipeline then parses without further special-casing.
 *
 * Tab grouping: consecutive sibling `/// tab | Title` blocks at the same
 * indent (separated only by blank lines) are wrapped in a single `::::tabs`
 * parent, matching the legacy `=== "Title"` normalizer's output shape so the
 * downstream tab-transform handles both grammars uniformly.
 *
 * Idempotency: only `///`-prefixed lines are recognized; output that already
 * uses `:::` directive syntax is passed through untouched.
 *
 * Fenced-code safety: lines inside triple-backtick fences are preserved
 * verbatim, so a `/// note` example inside a code block is not rewritten.
 */

import {
  parseBlocksLine,
  type BlocksOpening,
} from '../../domain/syntax/blocks-line.js';
import { ADMONITION_FENCE_DEPTH } from './admonitions.js';

const FENCE = /^ {0,3}(```|~~~)/;
const TAB_NAME = 'tab';
const DETAILS_NAME = 'details';
const CAPTION_NAME = 'caption';
const DEFINE_NAME = 'define';
const HTML_NAME = 'html';
const ADMONITION_NAME = 'admonition';
// `pymdownx.blocks.html`'s "title" slot encodes a CSS-selector-like element
// spec: `tag[class=foo]`, `tag[id=bar]`, `tag[class=foo class2]`. We only
// honor `tag` and `class` for Phase-1.
const HTML_ELEMENT_SPEC = /^(?<tag>[a-z][a-z0-9-]*)(?:\[class=(?<cls>[^\]]+)\])?$/i;
// `pymdownx.blocks.admonition` accepts a YAML-ish options block immediately
// after the opener: 4-space-indented `key: value` lines, optionally
// terminated by a `---` separator before the body proper. We honor only
// `type:` for now (the override that picks the visual style).
const TYPE_OPTION = /^ {4}type:\s*([A-Za-z0-9_-]+)\s*$/;
const OPTIONS_SEPARATOR = /^---\s*$/;

interface CollectedBlock {
  readonly opening: BlocksOpening;
  readonly openIndex: number;
  readonly closeIndex: number;
}

export function normalizeBlocks(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let i = 0;
  let inFence = false;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (FENCE.test(line)) {
      output.push(line);
      inFence = !inFence;
      i += 1;
      continue;
    }

    if (inFence) {
      output.push(line);
      i += 1;
      continue;
    }

    const parsed = parseBlocksLine(line);
    if (parsed === null || parsed.kind !== 'open') {
      output.push(line);
      i += 1;
      continue;
    }

    const closeIndex = findMatchingClose(lines, i + 1, parsed.fenceLength, parsed.indent);
    if (closeIndex === -1) {
      // Unterminated fence — leave the source unchanged so a downstream
      // diagnostic stage can surface the mismatch without losing content.
      output.push(line);
      i += 1;
      continue;
    }

    if (parsed.name === TAB_NAME) {
      const group = collectTabGroup(lines, parsed, i, closeIndex);
      output.push(...renderTabGroup(lines, group));
      i = group[group.length - 1]!.closeIndex + 1;
      continue;
    }

    if (parsed.name === CAPTION_NAME) {
      // pymdownx.blocks.caption emits a `<figcaption>` paired with the
      // immediately preceding image. Phase-1 emits a standalone
      // `<figcaption>` element; the user (or a future AST pass) wraps the
      // surrounding image and caption together in a `<figure>`. Body lines
      // are joined verbatim — no inner-block recursion, since captions never
      // contain nested directives.
      const bodySlice = lines.slice(i + 1, closeIndex).join('\n');
      output.push(`<figcaption>${bodySlice}</figcaption>`);
      i = closeIndex + 1;
      continue;
    }

    if (parsed.name === DEFINE_NAME) {
      // pymdownx.blocks.definition (block name `define`) has no semantic the
      // outer fence carries — the inner content is a Python-Markdown
      // definition list that `normalizeDefinitionLists` already rewrites to
      // `<dl>` HTML further down the pipeline. Strip the `///` wrapper and
      // pass the body through unmodified.
      const bodySlice = lines.slice(i + 1, closeIndex).join('\n');
      if (bodySlice.length > 0) {
        output.push(bodySlice);
      }
      i = closeIndex + 1;
      continue;
    }

    if (parsed.name === HTML_NAME) {
      // pymdownx.blocks.html. Bare form (no title) emits the body as raw
      // HTML; `| tag[class=cls]` form wraps the body in an HTML element with
      // the given tag and (optional) class. Other selector shapes (id, data
      // attributes, multiple classes) are out of scope for Phase 1 and fall
      // back to plain body emission.
      const bodySlice = lines.slice(i + 1, closeIndex).join('\n');
      output.push(...renderHtmlBlock(parsed.title, bodySlice));
      i = closeIndex + 1;
      continue;
    }

    const { typeOverride, bodyStart } = parseOptions(lines, i + 1, closeIndex);
    const bodySlice = lines.slice(bodyStart, closeIndex).join('\n');
    const effectiveName = resolveBlockName(parsed.name, typeOverride);
    output.push(renderOpening(parsed, effectiveName));
    if (bodySlice.length > 0) {
      output.push(normalizeBlocks(bodySlice));
    }
    output.push(`${' '.repeat(parsed.indent)}${':'.repeat(ADMONITION_FENCE_DEPTH)}`);
    i = closeIndex + 1;
  }

  return output.join('\n');
}

interface ParsedOptions {
  readonly typeOverride: string | null;
  readonly bodyStart: number;
}

function parseOptions(
  lines: readonly string[],
  start: number,
  closeIndex: number,
): ParsedOptions {
  let typeOverride: string | null = null;
  let cursor = start;

  while (cursor < closeIndex) {
    const line = lines[cursor] ?? '';
    const typeMatch = line.match(TYPE_OPTION);
    if (typeMatch !== null) {
      typeOverride = typeMatch[1] ?? null;
      cursor += 1;
      continue;
    }
    break;
  }

  // Optional `---` separator between the options block and the body.
  if (cursor < closeIndex && OPTIONS_SEPARATOR.test(lines[cursor] ?? '')) {
    cursor += 1;
  }

  return { typeOverride, bodyStart: cursor };
}

function resolveBlockName(rawName: string, typeOverride: string | null): string {
  if (rawName === ADMONITION_NAME) {
    return typeOverride ?? 'note';
  }
  return rawName;
}

function findMatchingClose(
  lines: readonly string[],
  start: number,
  expectedFence: number,
  expectedIndent: number,
): number {
  for (let i = start; i < lines.length; i += 1) {
    const parsed = parseBlocksLine(lines[i] ?? '');
    if (
      parsed !== null &&
      parsed.kind === 'close' &&
      parsed.fenceLength === expectedFence &&
      parsed.indent === expectedIndent
    ) {
      return i;
    }
  }
  return -1;
}

function collectTabGroup(
  lines: readonly string[],
  firstOpening: BlocksOpening,
  firstOpenIndex: number,
  firstCloseIndex: number,
): ReadonlyArray<CollectedBlock> {
  const tabs: CollectedBlock[] = [
    { opening: firstOpening, openIndex: firstOpenIndex, closeIndex: firstCloseIndex },
  ];

  let scan = skipBlankLines(lines, firstCloseIndex + 1);
  while (scan < lines.length) {
    const next = parseBlocksLine(lines[scan] ?? '');
    if (
      next === null ||
      next.kind !== 'open' ||
      next.name !== TAB_NAME ||
      next.indent !== firstOpening.indent
    ) {
      break;
    }
    const close = findMatchingClose(lines, scan + 1, next.fenceLength, next.indent);
    if (close === -1) {
      break;
    }
    tabs.push({ opening: next, openIndex: scan, closeIndex: close });
    scan = skipBlankLines(lines, close + 1);
  }

  return tabs;
}

function skipBlankLines(lines: readonly string[], index: number): number {
  let i = index;
  while (i < lines.length && (lines[i] ?? '').trim().length === 0) {
    i += 1;
  }
  return i;
}

function renderTabGroup(
  lines: readonly string[],
  tabs: ReadonlyArray<CollectedBlock>,
): ReadonlyArray<string> {
  const indent = ' '.repeat(tabs[0]!.opening.indent);
  const out: string[] = [`${indent}::::tabs`];

  for (const tab of tabs) {
    const title = tab.opening.title ?? '';
    out.push(`${indent}:::tab[${title}]`);
    const bodySlice = lines.slice(tab.openIndex + 1, tab.closeIndex).join('\n');
    if (bodySlice.length > 0) {
      out.push(normalizeBlocks(bodySlice));
    }
    out.push(`${indent}:::`);
  }

  out.push(`${indent}::::`);
  out.push('');
  return out;
}

function renderHtmlBlock(title: string | null, body: string): ReadonlyArray<string> {
  if (title === null) {
    return body.length > 0 ? [body] : [];
  }
  const match = title.match(HTML_ELEMENT_SPEC);
  if (match === null || match.groups === undefined) {
    // Unparseable element spec — fall back to bare-body emission.
    return body.length > 0 ? [body] : [];
  }
  const tag = match.groups['tag'] ?? '';
  const cls = match.groups['cls'];
  const openTag = cls === undefined ? `<${tag}>` : `<${tag} class="${cls}">`;
  return [openTag, body, `</${tag}>`];
}

function renderOpening(opening: BlocksOpening, effectiveName: string): string {
  const indent = ' '.repeat(opening.indent);
  const label = opening.title === null ? '' : `[${opening.title}]`;
  const fence = ':'.repeat(ADMONITION_FENCE_DEPTH);
  // pymdownx.blocks.details has no Starlight equivalent of its own, but the
  // existing admonition pipeline already maps `:::note[Title]{collapsible}`
  // through to a `<details><summary>` HTML pair. Rewriting `/// details` into
  // that form lets the downstream transform handle it without a second handler
  // for collapsible-only directives. Directive syntax order is name → label →
  // attrs, matching `remark-directive`'s parser.
  if (effectiveName === DETAILS_NAME) {
    return `${indent}${fence}note${label}{collapsible="closed"}`;
  }
  return `${indent}${fence}${effectiveName}${label}`;
}

/**
 * Pre-parse normalizer: rewrite `pymdownx.blocks.*` fenced blocks into
 * remark-directive container syntax. Pure text-to-text, no AST.
 *
 * Material is moving from indented admonitions (`!!! note`, `??? details`,
 * `=== "Tab"`) to fenced blocks:
 *
 *   /// note | Title
 *   body
 *   ///
 *
 * The closing fence uses the same number of slashes (>= 3); body lines need
 * no indent. The normalizer emits `:::name[Title]` ... `:::` directive
 * markup, which the unified pipeline parses directly.
 *
 * Tab grouping: consecutive sibling `/// tab | Title` blocks at the same
 * indent (only blank lines between) are wrapped in `::::tabs`, matching
 * the legacy `=== "Title"` shape so the tab-transform stays uniform.
 *
 * Idempotent (only `///`-prefixed lines are recognized) and fence-safe.
 */

import {
  parseBlocksLine,
  type BlocksOpening,
} from '../../domain/syntax/blocks-line.js';
import { ADMONITION_FENCE_DEPTH } from './admonitions.js';
import { isFenceLine } from '../../domain/syntax/fence.js';

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
  return normalizeBlocksRec(lines).output.join('\n');
}

interface NormalizedBlocks {
  readonly output: ReadonlyArray<string>;
  /** Maximum colon-fence depth emitted by directives in this block. */
  readonly maxFenceDepth: number;
}

/**
 * Recursive worker. Returns the normalized lines plus the deepest colon
 * fence emitted, so an enclosing container can choose a strictly greater
 * fence depth for its own opener and closer (otherwise the inner closer
 * would terminate the outer per remark-directive's closing rule).
 */
function normalizeBlocksRec(lines: ReadonlyArray<string>): NormalizedBlocks {
  const output: string[] = [];
  let i = 0;
  let inFence = false;
  let maxFenceDepth = 0;

  function track(depth: number): void {
    if (depth > maxFenceDepth) maxFenceDepth = depth;
  }

  function pushPassthrough(line: string): void {
    output.push(line);
    // A line might be a passthrough `:::+name…` directive emitted by an
    // earlier normalizer (e.g. the admonition pass). Track its depth so an
    // enclosing block's fence can clear it.
    track(measureDirectiveFenceDepth(line));
  }

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (isFenceLine(line)) {
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
      pushPassthrough(line);
      i += 1;
      continue;
    }

    const closeIndex = findMatchingClose(lines, i + 1, parsed.fenceLength, parsed.indent);
    if (closeIndex === -1) {
      // Unterminated fence — leave the source unchanged so a downstream
      // diagnostic stage can surface the mismatch without losing content.
      pushPassthrough(line);
      i += 1;
      continue;
    }

    if (parsed.name === TAB_NAME) {
      const group = collectTabGroup(lines, parsed, i, closeIndex);
      const rendered = renderTabGroup(lines, group);
      output.push(...rendered.output);
      track(rendered.maxFenceDepth);
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
    const bodyLines = lines.slice(bodyStart, closeIndex);
    const effectiveName = resolveBlockName(parsed.name, typeOverride);
    const inner = normalizeBlocksRec(bodyLines);
    const fenceDepth = Math.max(ADMONITION_FENCE_DEPTH, inner.maxFenceDepth + 1);
    output.push(renderOpening(parsed, effectiveName, fenceDepth));
    if (inner.output.length > 0) {
      output.push(inner.output.join('\n'));
    }
    output.push(`${' '.repeat(parsed.indent)}${':'.repeat(fenceDepth)}`);
    track(fenceDepth);
    i = closeIndex + 1;
  }

  return { output, maxFenceDepth };
}

/**
 * Return the depth of a leading directive fence on a line (open or close),
 * or 0 if the line is not a directive fence. Used by the recursive worker
 * to detect passthrough fences emitted by upstream normalizers.
 */
function measureDirectiveFenceDepth(line: string): number {
  const match = line.match(/^[ \t]*(:{3,})/);
  return match === null ? 0 : (match[1] ?? '').length;
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

interface RenderedTabGroup {
  readonly output: ReadonlyArray<string>;
  /** Deepest colon fence emitted by this tab group (including its own wrappers). */
  readonly maxFenceDepth: number;
}

function renderTabGroup(
  lines: readonly string[],
  tabs: ReadonlyArray<CollectedBlock>,
): RenderedTabGroup {
  const indent = ' '.repeat(tabs[0]!.opening.indent);
  const out: string[] = [];

  // Compute each tab's body-derived fence depth first so we can size the
  // tab and tabs wrappers strictly above any inner directive fence.
  interface RenderedTab {
    readonly title: string;
    readonly innerOutput: ReadonlyArray<string>;
    readonly innerMax: number;
  }
  const rendered: RenderedTab[] = [];
  let groupInnerMax = 0;
  for (const tab of tabs) {
    const title = tab.opening.title ?? '';
    const bodyLines = lines.slice(tab.openIndex + 1, tab.closeIndex);
    const inner = normalizeBlocksRec(bodyLines);
    rendered.push({ title, innerOutput: inner.output, innerMax: inner.maxFenceDepth });
    if (inner.maxFenceDepth > groupInnerMax) groupInnerMax = inner.maxFenceDepth;
  }

  // Tab fence must exceed the deepest directive fence in any tab body so its
  // closer doesn't accidentally terminate them. Default 3 is fine when no
  // inner directives exist (the historical baseline).
  const TAB_BASE_DEPTH = 3;
  const TABS_BASE_DEPTH = 4;
  const tabDepth = Math.max(TAB_BASE_DEPTH, groupInnerMax + 1);
  // tabs wrapper must exceed every tab fence too.
  const tabsDepth = Math.max(TABS_BASE_DEPTH, tabDepth + 1);

  out.push(`${indent}${':'.repeat(tabsDepth)}tabs`);
  for (const r of rendered) {
    out.push(`${indent}${':'.repeat(tabDepth)}tab[${r.title}]`);
    if (r.innerOutput.length > 0) {
      out.push(r.innerOutput.join('\n'));
    }
    out.push(`${indent}${':'.repeat(tabDepth)}`);
  }
  out.push(`${indent}${':'.repeat(tabsDepth)}`);
  out.push('');
  return { output: out, maxFenceDepth: tabsDepth };
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

function renderOpening(
  opening: BlocksOpening,
  effectiveName: string,
  fenceDepth: number,
): string {
  const indent = ' '.repeat(opening.indent);
  const label = opening.title === null ? '' : `[${opening.title}]`;
  const fence = ':'.repeat(fenceDepth);
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

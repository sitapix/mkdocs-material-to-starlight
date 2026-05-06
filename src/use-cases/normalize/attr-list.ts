/**
 * Strip PyMdown `attr_list` syntax (block and inline). Runs on `.md` and
 * `.mdx` — Astro/Starlight has no `attr_list` at the Markdown layer.
 * Without this strip, `| Code { scope='col' } |` in a table or
 * `:material-foo:{ .lg }` on a paragraph leaves the brace blob visible
 * (Ruff `rules.md` regressed this way).
 *
 * Shares its implementation with `sanitizeMdxSyntax` so both passes stay
 * in sync; the strips are idempotent for defense-in-depth.
 *
 * Math-shielded: TeX `$$ … $$` and `$ … $` blocks pass through; their
 * brace pairs (`{k=0}`, `{\infty}`) are subscript/argument groups, not
 * attr_lists. Pure.
 */

import {
  stripBareAttrListLines,
  stripInlineAttrLists,
  type SanitizeReport,
} from '../mdx-detection/sanitize-mdx-syntax.js';

const MATH_PLACEHOLDER_PREFIX = '\u0000MATH';
const MATH_PLACEHOLDER_SUFFIX = '\u0000';

export function normalizeAttrList(source: string, report?: SanitizeReport): string {
  const { masked, blocks } = maskMath(source);
  const stripped = stripInlineAttrLists(
    stripBareAttrListLines(masked, report),
    report,
  );
  return unmaskMath(stripped, blocks);
}

interface MaskResult {
  readonly masked: string;
  readonly blocks: ReadonlyArray<string>;
}

/**
 * Replace `$$ … $$` (block math) and `$ … $` (inline math) with NUL-bordered
 * placeholders so the attr_list strip cannot see brace pairs inside math.
 * Block math is matched non-greedily so consecutive equation environments
 * remain separate. Inline math requires the closing `$` on the same line —
 * a stray `$` (currency, end-of-line) is left alone.
 */
function maskMath(source: string): MaskResult {
  const blocks: string[] = [];
  // Block math: `$$ ... $$` (multi-line OK, non-greedy).
  let masked = source.replace(/\$\$[\s\S]*?\$\$/g, (m) => {
    const idx = blocks.length;
    blocks.push(m);
    return `${MATH_PLACEHOLDER_PREFIX}${idx}${MATH_PLACEHOLDER_SUFFIX}`;
  });
  // Inline math: `$ ... $` on a single line. Must NOT match the placeholders
  // we just inserted (`\u0000` is excluded from the body class).
  masked = masked.replace(/\$([^\s$\u0000][^\n$\u0000]*?)\$/g, (m) => {
    const idx = blocks.length;
    blocks.push(m);
    return `${MATH_PLACEHOLDER_PREFIX}${idx}${MATH_PLACEHOLDER_SUFFIX}`;
  });
  return { masked, blocks };
}

function unmaskMath(masked: string, blocks: ReadonlyArray<string>): string {
  if (blocks.length === 0) return masked;
  return masked.replace(
    /\u0000MATH(\d+)\u0000/g,
    (_, n: string) => blocks[Number.parseInt(n, 10)] ?? '',
  );
}

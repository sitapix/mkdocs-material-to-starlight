/**
 * Pre-parse normalizer for Critic Markup (`pymdownx.critic`).
 *
 *   {++ added text ++}        → <ins> added text </ins>
 *   {-- deleted text --}      → <del> deleted text </del>
 *   {~~ old ~> new ~~}        → <del>old</del><ins>new</ins>
 *   {== highlighted text ==}  → <mark> highlighted text </mark>
 *   {>> comment <<}           → <span class="critic-comment"> comment </span>
 *
 * No remark plugin handles Critic Markup at the mdast level, so this rewrites
 * at the text level for plain `.md` output.
 *
 * Ordering: must run before `inline-marks`. `{==text==}` nests an inner
 * `==text==` pair that `inline-marks`' `==` matcher would otherwise consume.
 * `normalize.ts` enforces the order.
 *
 * Idempotent (output has no `{++ {-- {~~ {== {>>` markers) and fence-shielded.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const SUBSTITUTION_RE = /\{~~([\s\S]+?)~>([\s\S]+?)~~\}/g;
const INSERT_RE = /\{\+\+([\s\S]+?)\+\+\}/g;
const DELETE_RE = /\{--([\s\S]+?)--\}/g;
const HIGHLIGHT_RE = /\{==([\s\S]+?)==\}/g;
const COMMENT_RE = /\{>>([\s\S]+?)<<\}/g;

/**
 * Group consecutive non-fence lines into "blocks" and apply Critic regexes
 * to each block as a single string. This is what makes multi-paragraph
 * spans work — a line-by-line approach cannot match `{==\n\nbody\n\n==}`
 * because the regex never sees both delimiters at once. Real-world:
 * crafty-documentation/macos.md uses Critic to highlight a 3-paragraph
 * note; the opening `{==` survives to MDX as `{` + `==`, which acorn
 * rejects as "Could not parse expression."
 *
 * Fenced code stays untouched — the per-block strategy preserves fence
 * shielding because the regex callbacks never see fence content.
 */
export function normalizeCriticMarkup(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;
  let buffer: string[] = [];

  const flush = (): void => {
    if (buffer.length === 0) return;
    output.push(rewriteBlock(buffer.join('\n')));
    buffer = [];
  };

  for (const line of lines) {
    if (isFenceLine(line)) {
      flush();
      output.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      output.push(line);
      continue;
    }
    buffer.push(line);
  }
  flush();

  return output.join('\n');
}

function rewriteBlock(line: string): string {
  let out = line;
  out = out.replace(SUBSTITUTION_RE, (_match, oldText: string, newText: string) =>
    `<del>${oldText}</del><ins>${newText}</ins>`,
  );
  out = out.replace(INSERT_RE, (_match, body: string) => `<ins>${body}</ins>`);
  out = out.replace(DELETE_RE, (_match, body: string) => `<del>${body}</del>`);
  out = out.replace(HIGHLIGHT_RE, (_match, body: string) => `<mark>${body}</mark>`);
  out = out.replace(
    COMMENT_RE,
    (_match, body: string) => `<span class="critic-comment">${body}</span>`,
  );
  return out;
}

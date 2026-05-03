/**
 * Pre-parse normalizer for Critic Markup (the `pymdownx.critic` extension).
 *
 *   {++ added text ++}            → <ins> added text </ins>
 *   {-- deleted text --}          → <del> deleted text </del>
 *   {~~ old ~> new ~~}            → <del>old</del><ins>new</ins>
 *   {== highlighted text ==}      → <mark> highlighted text </mark>
 *   {>> reviewer comment <<}      → <span class="critic-comment"> reviewer comment </span>
 *
 * No remark plugin handles Critic Markup with mdast integration (the standalone
 * `critic-markup` package is a string renderer only — see
 * library_audit_20260501.md). We rewrite at the text level so the output
 * works in plain `.md`.
 *
 * **Ordering note.** Critic's `{== ==}` highlight token nests inside curly
 * braces, while PyMdown's `pymdownx.mark` extension uses bare `==text==`.
 * The composed pipeline must run this normalizer BEFORE `inline-marks` so
 * `inline-marks`' `==` matcher does not accidentally consume the inner `==`
 * pair of `{==…==}`. The composition in `normalize.ts` enforces this order.
 *
 * Idempotency: HTML output contains no `{++` / `{--` / `{~~` / `{==` / `{>>`
 * source markers, so `normalize(normalize(x)) === normalize(x)`.
 *
 * Fenced-code safety: lines inside ` ``` ` are passed through verbatim.
 */

const FENCE = /^ {0,3}(```|~~~)/;

const SUBSTITUTION_RE = /\{~~([\s\S]+?)~>([\s\S]+?)~~\}/g;
const INSERT_RE = /\{\+\+([\s\S]+?)\+\+\}/g;
const DELETE_RE = /\{--([\s\S]+?)--\}/g;
const HIGHLIGHT_RE = /\{==([\s\S]+?)==\}/g;
const COMMENT_RE = /\{>>([\s\S]+?)<<\}/g;

export function normalizeCriticMarkup(source: string): string {
  const lines = source.split('\n');
  const output: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) {
      output.push(line);
      inFence = !inFence;
      continue;
    }
    output.push(inFence ? line : rewriteLine(line));
  }

  return output.join('\n');
}

function rewriteLine(line: string): string {
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

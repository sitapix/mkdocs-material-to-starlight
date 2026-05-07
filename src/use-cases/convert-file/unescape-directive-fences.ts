/**
 * Post-stringify cleanup: strip the leading `\` from lines that consist of a
 * directive-fence run (`:::+`, optionally with leading whitespace).
 *
 * `remark-stringify` escapes `:::` to `\:::` whenever the surrounding context
 * could ambiguously parse it as a directive. For deeply-nested admonition
 * structures, this produces visible `\:::` / `\::::::` artifacts in output
 * markdown. Since a bare directive fence at line-start is unambiguously a
 * fence (the converter emits no other meaning for it), the escape is purely
 * cosmetic noise we can drop.
 *
 * Pure: text → text. Idempotent (re-running is a no-op once the escape is
 * gone). Safe: matches only fences as their own complete line; inline `\:::`
 * in prose is preserved.
 */

const FENCE_LINE_RE = /^(\s*)\\(:{3,})\s*$/gm;

export function unescapeDirectiveFences(text: string): string {
  return text.replace(FENCE_LINE_RE, (_, indent: string, colons: string) => `${indent}${colons}`);
}

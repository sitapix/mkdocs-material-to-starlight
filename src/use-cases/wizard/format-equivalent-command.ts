/**
 * Render the wizard's equivalent CLI command as a copy-pasteable string.
 *
 * - Short commands (≤80 chars when joined) render on a single line so the
 *   user can grab the whole thing in one go.
 * - Long commands wrap with the POSIX backslash-newline convention so the
 *   user can still paste the entire block into a shell unchanged. Each
 *   continuation line is indented two spaces for legibility.
 *
 * The 80-char threshold matches the convention used by Git, Cargo, and
 * most shell-formatting style guides — narrow enough to fit a 2-up tile,
 * wide enough that the simple cases never wrap.
 */

const SINGLE_LINE_LIMIT = 80;

export interface EquivalentCommandHighlighter {
  /** Decorator for the binary name (first token). */
  readonly binary?: (text: string) => string;
}

export function formatEquivalentCommand(
  argv: ReadonlyArray<string>,
  binaryName = 'mkdocs-material-to-starlight',
  highlighter: EquivalentCommandHighlighter = {},
): string {
  const decoratedBinary = (highlighter.binary ?? identity)(binaryName);
  // Wrap-decision uses the *plain* binary length so ANSI escapes don't push
  // a one-liner over the threshold and force a multi-line render.
  const plainTokens = [binaryName, ...argv];
  const plainSingle = plainTokens.join(' ');
  const tokens = [decoratedBinary, ...argv];
  if (plainSingle.length <= SINGLE_LINE_LIMIT) return tokens.join(' ');
  return tokens
    .map((tok, i) => {
      if (i === 0) return `${tok} \\`;
      if (i === tokens.length - 1) return `  ${tok}`;
      return `  ${tok} \\`;
    })
    .join('\n');
}

function identity(text: string): string {
  return text;
}

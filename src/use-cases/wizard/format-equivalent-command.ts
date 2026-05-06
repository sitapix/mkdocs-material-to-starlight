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

export function formatEquivalentCommand(
  argv: ReadonlyArray<string>,
  binaryName = 'mkdocs-material-to-starlight',
): string {
  const tokens = [binaryName, ...argv];
  const single = tokens.join(' ');
  if (single.length <= SINGLE_LINE_LIMIT) return single;
  return tokens
    .map((tok, i) => {
      if (i === 0) return `${tok} \\`;
      if (i === tokens.length - 1) return `  ${tok}`;
      return `  ${tok} \\`;
    })
    .join('\n');
}

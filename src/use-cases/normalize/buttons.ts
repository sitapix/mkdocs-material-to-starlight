/**
 * Pre-parse normalizer for Material's `.md-button` link decoration:
 *
 *   [Subscribe](https://example.com){ .md-button }
 *   [Subscribe](https://example.com){ .md-button .md-button--primary }
 *
 * Material uses `attr_list` to attach a CSS class to the link. Starlight has
 * a `<LinkButton>` component that mirrors this visually, but emitting JSX
 * forces the page to `.mdx`. We instead emit inline HTML
 * (`<a href="..." class="md-button">label</a>`) which works in plain `.md`,
 * preserves the link semantics, and lets the user opt into Starlight's
 * `<LinkButton>` per page if they want by upgrading the file to `.mdx`.
 *
 * Idempotency: only `[label](url){ .md-button[ ...] }` patterns are
 * recognized; HTML output contains no `.md-button` source markers, so
 * `normalize(normalize(x)) === normalize(x)`.
 *
 * Fenced-code safety: lines inside triple-backtick fences are passed through
 * verbatim so a button example inside a code block is not rewritten.
 */

const FENCE = /^ {0,3}(```|~~~)/;
const BUTTON_RE =
  /\[(?<label>[^\]\n]+)\]\((?<url>[^)\n]+)\)\{ *(?<classes>\.md-button(?: +\.md-button--[a-z0-9-]+)*) *\}/g;

export function normalizeButtons(source: string): string {
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
  return line.replace(BUTTON_RE, (_match, ..._args) => {
    const groups = _args[_args.length - 1] as {
      label: string;
      url: string;
      classes: string;
    };
    const classNames = groups.classes
      .split(/\s+/)
      .filter((token) => token.startsWith('.'))
      .map((token) => token.slice(1))
      .join(' ');
    return `<a href="${groups.url}" class="${classNames}">${groups.label}</a>`;
  });
}

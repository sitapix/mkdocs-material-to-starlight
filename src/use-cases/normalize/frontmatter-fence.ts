/**
 * Canonicalize a YAML document-end marker used to close leading frontmatter.
 *
 * Python-Markdown accepts `...` as the closing marker for a leading YAML
 * metadata block. remark-frontmatter expects the closing fence to match the
 * opening `---`; without this rewrite it can treat the remaining document as
 * YAML or serialize the metadata as visible body text.
 *
 * Only the first fence-shaped line after a leading `---` is considered. This
 * keeps `...` in ordinary body content untouched and makes the transform
 * idempotent.
 */
export function normalizeFrontmatterFence(source: string): string {
  const opening = /^---[\t ]*(?:\r?\n|$)/.exec(source);
  if (opening === null) return source;

  const fence = /^(---|\.\.\.)[\t ]*(?=\r?$)/gm;
  fence.lastIndex = opening[0].length;
  const closing = fence.exec(source);
  if (closing === null || closing[1] !== '...') return source;

  return `${source.slice(0, closing.index)}---${source.slice(closing.index + closing[0].length)}`;
}

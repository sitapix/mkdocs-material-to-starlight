/**
 * Strip `pymdownx.inlinehilite` language hints from inline code spans.
 *
 * Material syntax:
 *   `:::python x = 1`
 *   `#!python x = 1`
 *
 * Both forms hint Pygments at the inline syntax. Starlight's inline code
 * doesn't support per-instance language tagging — it's monospaced text
 * with no syntax highlighting. We strip the hint so the rendered code
 * shows the actual content cleanly.
 *
 * Pure: text → text. Idempotent (the markers don't survive a first pass).
 */

const INLINE_HINT_RE = /`(?::::|#!)([A-Za-z0-9_+-]+)\s+([^`]+)`/g;

export function normalizeInlineHilite(source: string): string {
  return source.replace(INLINE_HINT_RE, (_, _lang, body) => `\`${body}\``);
}

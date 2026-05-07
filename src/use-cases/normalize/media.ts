/**
 * Pre-parse normalizer for `mkdocs-audio` and `mkdocs-video`.
 *
 * Both plugins extend Markdown's image syntax with a `type:` alt-text
 * prefix:
 *
 *   ![type:video](https://example.com/clip.mp4)
 *   ![type:audio](https://example.com/podcast.mp3)
 *
 * Why this is text-level, not AST-level: `remark-directive` (which the
 * converter wires into every file's pipeline for `:::tab` / `:::aside`
 * support) parses the leading `:video` / `:audio` inside the image alt
 * as an inline text directive, truncating the alt to `type` and dropping
 * the marker before any AST visitor runs. Pre-parse rewriting sidesteps
 * the directive parser entirely.
 *
 * Output: native HTML5 `<audio>` / `<video>` elements with `controls`.
 * They render in plain Markdown without imports and don't promote the
 * file to `.mdx`. Idempotent: emitted HTML is not image-shaped, so a
 * second pass is a no-op. Fence-shielded.
 */

import { isFenceLine } from '../../domain/syntax/fence.js';

const MEDIA_RE = /!\[type:(audio|video)\]\(([^)\n]*)\)/g;

export interface MediaPromotion {
  /** 1-based line number where the promotion fired. */
  readonly line: number;
  /** 'audio' or 'video' — the matched media type. */
  readonly kind: 'audio' | 'video';
  /** The URL that became the `src` attribute. */
  readonly url: string;
}

export interface NormalizeMediaResult {
  readonly text: string;
  readonly promotions: ReadonlyArray<MediaPromotion>;
}

export function normalizeMedia(source: string): NormalizeMediaResult {
  const lines = source.split('\n');
  const out: string[] = [];
  const promotions: MediaPromotion[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (isFenceLine(line)) {
      out.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    out.push(
      line.replace(MEDIA_RE, (_match, kind: 'audio' | 'video', url: string) => {
        promotions.push({ line: i + 1, kind, url });
        return `<${kind} src="${escapeAttr(url)}" controls></${kind}>`;
      }),
    );
  }
  return { text: out.join('\n'), promotions };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

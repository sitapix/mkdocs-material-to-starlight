/**
 * Translate the MkDocs `toc` extension config into Starlight's
 * `tableOfContents: { minHeadingLevel, maxHeadingLevel }`.
 *
 * Pure: takes the parsed markdown_extensions list, returns the Starlight
 * shape or undefined when the toc extension is absent.
 *
 * Material's `toc_depth` accepts:
 *   - integer (default 6): max heading level included
 *   - string range "2-4": min and max levels
 *
 * Starlight's range is `{ minHeadingLevel, maxHeadingLevel }` clamped to 2-6.
 */

import type { MkdocsMarkdownExtension } from '../../domain/config/mkdocs-config.js';

export interface TocConfig {
  readonly minHeadingLevel: number;
  readonly maxHeadingLevel: number;
}

export function extractTocConfig(
  extensions: ReadonlyArray<MkdocsMarkdownExtension>,
): TocConfig | undefined {
  const entry = extensions.find((e) => e.name === 'toc');
  if (entry === undefined) return undefined;
  const tocDepth = entry.options.toc_depth;
  if (typeof tocDepth === 'string') {
    const match = tocDepth.match(/^(\d+)-(\d+)$/);
    if (match !== null) {
      return {
        minHeadingLevel: clamp(Number(match[1]), 2, 6),
        maxHeadingLevel: clamp(Number(match[2]), 2, 6),
      };
    }
  }
  if (typeof tocDepth === 'number') {
    return { minHeadingLevel: 2, maxHeadingLevel: clamp(tocDepth, 2, 6) };
  }
  return { minHeadingLevel: 2, maxHeadingLevel: 6 };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

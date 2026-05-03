/**
 * Translate Material's per-page `hide:` frontmatter array into Starlight
 * frontmatter equivalents.
 *
 * Material:
 *   ---
 *   title: X
 *   hide:
 *     - navigation
 *     - toc
 *     - footer
 *   ---
 *
 * Mapping:
 *   - hide: toc        → tableOfContents: false
 *   - hide: navigation → template: splash
 *   - hide: footer     → no Starlight equivalent in core; dropped silently
 *
 * The `hide:` block is removed from frontmatter regardless of mapping
 * outcome (otherwise it would surface as `unknown-frontmatter-field`).
 *
 * Pure: text → text. Idempotent (the `hide:` key never reappears).
 */

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const BLOCK_HIDE_RE = /^hide:[ \t]*\n((?:[ \t]+-[^\n]*(?:\n|$))+)/m;
const INLINE_HIDE_RE = /^hide:[ \t]*\[([^\]]*)\]\s*$/m;

export function normalizeFrontmatterHide(source: string): string {
  const match = source.match(FRONTMATTER_RE);
  if (match === null) return source;
  const fmBody = match[1] ?? '';
  const values = extractHideValues(fmBody);
  if (values === null) return source;
  const cleaned = removeHideKey(fmBody);
  const additions: string[] = [];
  if (values.includes('toc')) additions.push('tableOfContents: false');
  if (values.includes('navigation')) additions.push('template: splash');
  const newFm = additions.length === 0 ? cleaned : `${cleaned.trimEnd()}\n${additions.join('\n')}`;
  return source.replace(FRONTMATTER_RE, `---\n${newFm}\n---`);
}

function extractHideValues(fmBody: string): ReadonlyArray<string> | null {
  const inline = fmBody.match(INLINE_HIDE_RE);
  if (inline !== null) {
    return (inline[1] ?? '').split(',').map((v) => v.trim()).filter((v) => v.length > 0);
  }
  const block = fmBody.match(BLOCK_HIDE_RE);
  if (block !== null) {
    const items = block[1] ?? '';
    return items
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('-'))
      .map((l) => l.slice(1).trim());
  }
  return null;
}

function removeHideKey(fmBody: string): string {
  let cleaned = fmBody.replace(BLOCK_HIDE_RE, '');
  cleaned = cleaned.replace(INLINE_HIDE_RE, '');
  return cleaned.replace(/\n{3,}/g, '\n\n');
}

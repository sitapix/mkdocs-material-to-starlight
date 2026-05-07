/**
 * Translate Material's per-page `hide:` frontmatter array into Starlight
 * equivalents.
 *
 * Mapping:
 *   - hide: toc        → tableOfContents: false
 *   - hide: navigation → template: splash
 *   - hide: footer     → no Starlight equivalent (dropped)
 *
 * The `hide:` block is always removed (otherwise it surfaces as
 * `unknown-frontmatter-field`). Pure and idempotent.
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
  let cleaned = removeHideKey(fmBody);
  const additions: string[] = [];
  if (values.includes('toc')) additions.push('tableOfContents: false');
  if (values.includes('navigation')) {
    // Strip any pre-existing `template:` key (e.g. Material's
    // `template: welcome.html`) before appending `template: splash` so the
    // resulting frontmatter has exactly one `template:` line. Duplicate
    // YAML keys at the same indent level are a fatal parse error in
    // Astro's frontmatter loader.
    cleaned = cleaned
      .split('\n')
      .filter((line) => !/^template\s*:/.test(line))
      .join('\n');
    additions.push('template: splash');
  }
  const newFm = additions.length === 0 ? cleaned : `${cleaned.trimEnd()}\n${additions.join('\n')}`;
  return source.replace(FRONTMATTER_RE, `---\n${newFm}\n---`);
}

function extractHideValues(fmBody: string): ReadonlyArray<string> | null {
  const inline = fmBody.match(INLINE_HIDE_RE);
  if (inline !== null) {
    return (inline[1] ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
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

/**
 * Pre-parse normalizer: strip Material's `attr_list` extension from the end
 * of ATX headings.
 *
 * Material for MkDocs allows authors to attach attributes to headings:
 *
 *   # First Steps { #first-steps }
 *   ## Check it { #check-it .highlighted }
 *
 * The `{ ... }` blob — typically an explicit ID with `#name`, optional CSS
 * classes with `.name`, and key=value pairs — is consumed by the
 * `attr_list` Python-Markdown extension and applied to the heading element.
 *
 * Starlight has no first-class API for explicit heading IDs. Its slugger
 * auto-generates IDs from heading text (`First Steps` → `first-steps`),
 * which matches the explicit override in the vast majority of real-world
 * cases. Without normalization the literal `{ #first-steps }` survives
 * into the rendered title bar and into the synthesized frontmatter title,
 * producing visible noise like `First Steps { #first-steps }` in browser
 * tabs and sidebars.
 *
 * Behavior:
 *   - Strip a trailing `{ ... }` blob from any line that starts with one
 *     to six `#` characters followed by a space.
 *   - Preserve trailing closing-style ATX hashes (`# Title { #id } #` →
 *     `# Title #`).
 *   - Lines inside fenced code blocks are passed through verbatim.
 *
 * Idempotency: a heading with no attr_list is left alone, so a second pass
 * is a no-op.
 *
 * Lossy: explicit IDs that differ from the slugger's output (e.g.
 * `# What's New { #changelog }`) lose their stable anchor. This is an
 * acceptable trade today: Starlight has no opt-in for explicit IDs without
 * a custom rehype plugin, and most overrides in the wild match the slug.
 * If a future fixture proves otherwise we can route the IDs into a
 * conversion-time table and emit them as `<a id="..."></a>` anchors next
 * to the heading.
 */

const FENCE = /^ {0,3}(```|~~~)/;
// Matches an ATX heading line ending in a `{ ... }` attr_list, with optional
// trailing closing-style hashes preserved.
//   group 1 = leading hashes + space + heading text (no trailing whitespace)
//   group 2 = the attr_list blob (we discard it)
//   group 3 = optional closing-hash suffix (preserved if present)
const HEADING_WITH_ATTRS =
  /^(#{1,6} [^\n{]+?)\s*\{[^}\n]*\}\s*(#*)\s*$/;

export function normalizeHeadingAttrList(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      out.push(line);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const match = line.match(HEADING_WITH_ATTRS);
    if (match === null) {
      out.push(line);
      continue;
    }
    const heading = (match[1] ?? '').trimEnd();
    const closingHashes = match[2] ?? '';
    out.push(closingHashes === '' ? heading : `${heading} ${closingHashes}`);
  }
  return out.join('\n');
}

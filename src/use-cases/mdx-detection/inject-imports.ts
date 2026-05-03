/**
 * Inject `import { ... } from '@astrojs/starlight/components';` at the top
 * of an MDX file when Starlight built-in components are referenced without
 * an existing import.
 *
 * Pure: takes the source and the (already-detected) used component names,
 * returns the new source. Idempotent — if the canonical import line already
 * exists for any subset of the components, the function only adds missing
 * names and de-duplicates.
 *
 * The injection point is after the YAML frontmatter (when present) and a
 * blank line, then before the body. Existing imports above the body are
 * preserved.
 */

import { starlightBuiltins } from './detect.js';

const FRONTMATTER_RE = /^(---\n[\s\S]*?\n---\n)/;
const STARLIGHT_IMPORT_RE = /^import\s*\{\s*([^}]*)\s*\}\s*from\s*['"]@astrojs\/starlight\/components['"];?/m;

export function injectStarlightImports(
  source: string,
  usedComponents: ReadonlyArray<string>,
): string {
  const builtins = starlightBuiltins();
  const needed = [...new Set(usedComponents)]
    .filter((name) => builtins.has(name))
    .sort();
  if (needed.length === 0) return source;

  const existing = source.match(STARLIGHT_IMPORT_RE);
  if (existing !== null) {
    const existingNames = new Set(
      (existing[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
    for (const n of needed) existingNames.add(n);
    const merged = `import { ${[...existingNames].sort().join(', ')} } from '@astrojs/starlight/components';`;
    return source.replace(STARLIGHT_IMPORT_RE, merged);
  }

  const importLine = `import { ${needed.join(', ')} } from '@astrojs/starlight/components';`;
  const fmMatch = source.match(FRONTMATTER_RE);
  if (fmMatch !== null) {
    const fmEnd = (fmMatch[1] ?? '').length;
    const head = source.slice(0, fmEnd);
    const tail = source.slice(fmEnd);
    return `${head}\n${importLine}\n${tail.replace(/^\n+/, '')}`;
  }
  return `${importLine}\n\n${source}`;
}

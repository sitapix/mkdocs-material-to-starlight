/**
 * Pre-flight validation: scan a converted file for JSX components that are
 * neither Starlight built-ins nor explicitly imported in the file. Astro's
 * MDX runtime fails the build with an "Unknown component" error in that
 * case, so a converter that emits a typo or forgets an import produces a
 * project that fails its first build.
 *
 * Static check — no MDX parser required. We use a conservative regex that:
 *   1. Matches JSX-style opening tags `<ComponentName ...>` or `<ComponentName />`
 *      where `ComponentName` starts with an uppercase letter (HTML elements
 *      start lowercase by convention; React/MDX uses the same rule).
 *   2. Skips `.md` files — JSX is only meaningful in `.mdx`/`.mdoc`.
 *   3. Reads `import { Foo, Bar } from '...'` statements at the top of the
 *      file to extend the local allowlist.
 *
 * Pure: takes a source string + path, returns Diagnostic[]. No I/O.
 *
 * Limitations: namespace imports (`import * as X`), default imports, and
 * dynamic imports are not parsed; they cannot extend the allowlist. Most
 * Starlight migration output uses named imports exclusively, so this is
 * sufficient. Edge cases produce false positives (warnings, not errors) and
 * the user can either ignore them or extend the schema.
 */

import { STARLIGHT_COMPONENTS } from '../../domain/starlight/component-allowlist.js';
import type { Diagnostic } from '../../domain/diagnostics/diagnostic.js';

const JSX_TAG = /<([A-Z][A-Za-z0-9_.]*)/g;
const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;

export function validateJsxComponents(
  source: string,
  sourcePath: string,
): ReadonlyArray<Diagnostic> {
  if (!sourcePath.endsWith('.mdx') && !sourcePath.endsWith('.mdoc')) {
    return [];
  }

  const localImports = collectImportedNames(source);
  const allowed = new Set<string>([...STARLIGHT_COMPONENTS, ...localImports]);

  const seen = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const matches = source.matchAll(JSX_TAG);
  for (const match of matches) {
    const name = match[1] ?? '';
    if (name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
    // Skip dotted member access (`<Foo.Bar />`); we only validate the root.
    const root = name.split('.')[0] ?? name;
    if (allowed.has(root)) {
      continue;
    }
    diagnostics.push({
      ruleId: 'unknown-jsx-component',
      severity: 'warning',
      message: `<${name}> is neither a Starlight built-in component nor imported in "${sourcePath}"; Astro's MDX runtime will fail the build`,
      source: 'validate-output/jsx-components',
    });
  }
  return diagnostics;
}

function collectImportedNames(source: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(NAMED_IMPORT)) {
    const inside = match[1] ?? '';
    for (const raw of inside.split(',')) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      // `Foo as Bar` → use the alias `Bar` (the locally-bound name);
      // `Foo` alone → use as-is.
      const parts = trimmed.split(/\s+as\s+/);
      const localName = (parts[parts.length - 1] ?? '').trim();
      if (localName.length > 0) {
        names.add(localName);
      }
    }
  }
  return names;
}

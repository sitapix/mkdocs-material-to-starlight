/**
 * Pre-flight validation: flag JSX components that are neither Starlight
 * built-ins nor imported in the file. Astro's MDX runtime fails such builds
 * with "Unknown component", so a converter typo or missing import produces
 * a project that fails its first build.
 *
 * Static, no MDX parser. Conservative regex matches `<ComponentName ...>`
 * or `<ComponentName />` (uppercase-leading; HTML and JSX use the same
 * rule), skips `.md` (JSX needs `.mdx`/`.mdoc`), and reads top-of-file
 * `import { Foo, Bar } from '...'` to extend the local allowlist.
 *
 * Pure. Limitations: namespace, default, and dynamic imports do not extend
 * the allowlist. Migration output uses named imports almost exclusively;
 * edge-case false positives surface as warnings, not errors.
 */

import type { Diagnostic } from '../../domain/diagnostics/diagnostic.js';
import { STARLIGHT_COMPONENTS } from '../../domain/starlight/component-allowlist.js';

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

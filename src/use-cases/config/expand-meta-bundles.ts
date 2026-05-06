/**
 * Expand Python-Markdown / PyMdown meta-bundle extensions into their
 * components.
 *
 * Material sites use `pymdownx.extra` (or the legacy
 * `markdown.extensions.extra`) as a shortcut for a curated stack.
 * Downstream detectors match on individual extension names; without
 * expansion, a list containing only `pymdownx.extra` would miss every
 * consumer that looks for `attr_list`, `tables`, etc.
 *
 * Pure. Returns a list with every meta-bundle replaced by its members
 * (no duplicates) and the bundle entry itself removed. Idempotent.
 *
 * Reference: https://facelessuser.github.io/pymdown-extensions/extensions/extra/
 */

import type { MkdocsMarkdownExtension } from '../../domain/config/mkdocs-config.js';

const PYMDOWNX_EXTRA_COMPONENTS: ReadonlyArray<string> = [
  'pymdownx.betterem',
  'pymdownx.superfences',
  'footnotes',
  'attr_list',
  'def_list',
  'tables',
  'abbr',
  'md_in_html',
];

const META_BUNDLES: Readonly<Record<string, ReadonlyArray<string>>> = {
  'pymdownx.extra': PYMDOWNX_EXTRA_COMPONENTS,
  // Legacy Python-Markdown bundle (rare; deprecated in favor of pymdownx.extra
  // since the smartstrong / fenced_code conflicts above).
  extra: PYMDOWNX_EXTRA_COMPONENTS,
};

export function expandMetaBundles(
  extensions: ReadonlyArray<MkdocsMarkdownExtension>,
): ReadonlyArray<MkdocsMarkdownExtension> {
  const seen = new Set<string>();
  const output: MkdocsMarkdownExtension[] = [];

  for (const ext of extensions) {
    const components = META_BUNDLES[ext.name];
    if (components !== undefined) {
      // Drop the bundle entry itself; emit components that are not yet seen.
      // Component options are passed through from the bundle's nested
      // configuration if present (e.g., `pymdownx.extra: { footnotes: { ... } }`),
      // otherwise default to empty.
      const nested = (ext.options as Readonly<Record<string, unknown>>) ?? {};
      for (const componentName of components) {
        if (seen.has(componentName)) continue;
        seen.add(componentName);
        const componentOptions = nested[componentName];
        output.push({
          name: componentName,
          options:
            componentOptions !== null && typeof componentOptions === 'object'
              ? (componentOptions as Readonly<Record<string, unknown>>)
              : {},
        });
      }
      continue;
    }
    if (seen.has(ext.name)) continue;
    seen.add(ext.name);
    output.push(ext);
  }

  return output;
}

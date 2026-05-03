/**
 * Adapter that pulls a `pymdownx.highlight` entry out of the typed
 * markdown_extensions list and runs it through the curated Pygments→Shiki
 * mapping.
 *
 * Pure: takes the parsed extensions, returns the Starlight `expressiveCode`
 * input shape (or undefined when no usable input is present). The caller in
 * the interface shell threads the result into `serializeAstroConfig` and
 * emits the corresponding diagnostics.
 *
 * Why this layer exists separately from the domain mapping: the domain
 * function (`mapPygmentsHighlightToExpressiveCode`) accepts the loose YAML
 * shape so it can be reused in tests and `--explain` output. The use-case
 * adapter speaks the typed `MkdocsMarkdownExtension[]` shape produced by
 * the config parser, which is what the rest of the interface layer passes
 * around.
 */

import type { MkdocsMarkdownExtension } from '../../domain/config/mkdocs-config.js';
import {
  mapPygmentsHighlightToExpressiveCode,
  type ExpressiveCodeMapping,
} from '../../domain/starlight/expressive-code-mapping.js';

export function extractExpressiveCodeConfig(
  extensions: ReadonlyArray<MkdocsMarkdownExtension>,
): ExpressiveCodeMapping | undefined {
  const entry = extensions.find((e) => e.name === 'pymdownx.highlight');
  if (entry === undefined) return undefined;
  return mapPygmentsHighlightToExpressiveCode(entry.options) ?? undefined;
}

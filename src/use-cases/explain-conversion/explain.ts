/**
 * Explain what the converter will do to a given MkDocs project, before any
 * source file is touched.
 *
 * Given a parsed `mkdocs.yml`, this returns the subset of conversion-mapping
 * rows whose `requiredExtensions` are all enabled in the user's
 * configuration. The result is a deterministic preview suitable for a
 * `--explain` CLI mode.
 *
 * Pure: takes a `MkdocsConfig` value, returns a list of mapping rows. No I/O.
 *
 * Rows whose `requiredExtensions` is empty (always-applicable transforms
 * like internal-link rewriting) are included unconditionally.
 */

import type { MkdocsConfig } from '../../domain/config/mkdocs-config.js';
import {
  getAllMappingRows,
  type MappingRow,
} from '../../domain/conversion-mapping/table.js';
import { expandMetaBundles } from '../config/expand-meta-bundles.js';

export function explainConversion(
  config: MkdocsConfig,
): ReadonlyArray<MappingRow> {
  // Expand meta-bundles (`pymdownx.extra`, `extra`) so a row gated on a
  // component extension (e.g. `attr_list`) fires when the user shortcut
  // via the bundle.
  const expanded = expandMetaBundles(config.markdownExtensions);
  const enabled = new Set(expanded.map((ext) => ext.name));
  return getAllMappingRows().filter((row) =>
    row.requiredExtensions.every((required) => enabled.has(required)),
  );
}

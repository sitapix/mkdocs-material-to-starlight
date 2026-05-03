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

export function explainConversion(
  config: MkdocsConfig,
): ReadonlyArray<MappingRow> {
  const enabled = new Set(config.markdownExtensions.map((ext) => ext.name));
  return getAllMappingRows().filter((row) =>
    row.requiredExtensions.every((required) => enabled.has(required)),
  );
}

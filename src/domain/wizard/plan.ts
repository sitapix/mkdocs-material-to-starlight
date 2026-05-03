/**
 * The pre-pass conversion plan handed to the wizard so it knows which Tier 1
 * prompts to fire. A subset of what `explainConversion` returns plus the raw
 * mkdocs config view the wizard needs to compute conditional triggers.
 */

import type { MkdocsConfig } from '../config/mkdocs-config.js';
import type { MappingRow } from '../conversion-mapping/table.js';

export interface ConversionPlan {
  readonly config: MkdocsConfig;
  readonly mappingRows: ReadonlyArray<MappingRow>;
  readonly detectedExtraCss: ReadonlyArray<string>;
  readonly detectedExtraJs: ReadonlyArray<string>;
  readonly detectedLocales: ReadonlyArray<string>;
  readonly snippetCandidateDirs: ReadonlyArray<string>;
}

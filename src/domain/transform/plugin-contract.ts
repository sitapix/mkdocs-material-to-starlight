/**
 * Plugin contract: the declarative shape every transform plugin presents to
 * the pipeline assembler at boot time. This is data, not behaviour — the
 * actual transformation function lives in use-cases. The descriptor exists
 * so the assembler can validate the DAG, detect duplicate node ownership,
 * and order plugins by stage without ever running them.
 */

import { ok, err, type Result } from '../result.js';

export const PIPELINE_STAGES = [
  'normalize',
  'parse',
  'expand-snippets',
  'transform',
  'document-decision',
  'stringify',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * Disjoint-namespace declaration: a plugin owns the (nodeType, name) cell.
 * No two plugins may declare the same cell. Plugins that consume nodes whose
 * `name` is absent (e.g. raw `code` fences) declare `name: null`.
 */
export interface NamespaceClaim {
  readonly nodeType: string;
  readonly name: string | null;
}

export interface PluginDescriptor {
  readonly id: string;
  readonly stage: PipelineStage;
  readonly ownsNamespaces: ReadonlyArray<NamespaceClaim>;
  readonly dependsOn: ReadonlyArray<string>;
}

export interface ValidationError {
  readonly message: string;
}

export type ValidationResult = Result<null, ValidationError>;

const STAGE_SET: ReadonlySet<string> = new Set(PIPELINE_STAGES);

export function validatePluginDescriptor(d: PluginDescriptor): ValidationResult {
  if (d.id.length === 0) {
    return err({ message: 'plugin id must be non-empty' });
  }
  if (!STAGE_SET.has(d.stage)) {
    return err({ message: `unknown pipeline stage: ${String(d.stage)}` });
  }
  if (d.ownsNamespaces.length === 0) {
    return err({ message: 'plugin must declare at least one namespace claim' });
  }
  return ok(null);
}

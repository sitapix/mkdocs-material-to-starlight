/**
 * Pipeline assembler. Validates plugin descriptors at boot time and returns a
 * stable ordering: stage-major (canonical PIPELINE_STAGES order), input-order
 * within each stage. The assembler is pure — it touches no I/O and runs no
 * plugin code. If validation fails, the assembler returns a typed error
 * instead of throwing, so callers in the interface layer decide how to
 * present the failure.
 *
 * Invariants enforced here:
 *   1. Every descriptor passes validatePluginDescriptor.
 *   2. No two plugins claim the same (nodeType, name) namespace cell.
 *   3. Every dependsOn id resolves to a plugin in the input set.
 *   4. A plugin's dependency must appear in an earlier (or same) stage.
 */

import { err, ok, type Result } from '../../domain/result.js';
import {
  PIPELINE_STAGES,
  type PipelineStage,
  type PluginDescriptor,
  validatePluginDescriptor,
} from '../../domain/transform/plugin-contract.js';

interface AssemblyError {
  readonly message: string;
}

export type AssemblyResult = Result<ReadonlyArray<PluginDescriptor>, AssemblyError>;

export function assemblePipeline(plugins: ReadonlyArray<PluginDescriptor>): AssemblyResult {
  const descriptorError = findDescriptorError(plugins);
  if (descriptorError !== null) {
    return err(descriptorError);
  }

  const namespaceError = findNamespaceCollision(plugins);
  if (namespaceError !== null) {
    return err(namespaceError);
  }

  const dependencyError = findDependencyError(plugins);
  if (dependencyError !== null) {
    return err(dependencyError);
  }

  return ok(orderByStage(plugins));
}

function findDescriptorError(plugins: ReadonlyArray<PluginDescriptor>): AssemblyError | null {
  for (const p of plugins) {
    const result = validatePluginDescriptor(p);
    if (!result.ok) {
      return { message: `plugin "${p.id}": ${result.error.message}` };
    }
  }
  return null;
}

function findNamespaceCollision(plugins: ReadonlyArray<PluginDescriptor>): AssemblyError | null {
  const seen = new Map<string, string>();
  for (const p of plugins) {
    for (const claim of p.ownsNamespaces) {
      const key = `${claim.nodeType}|${claim.name ?? '*'}`;
      const owner = seen.get(key);
      if (owner !== undefined) {
        return {
          message: `duplicate namespace claim on (${claim.nodeType}, ${
            claim.name ?? '*'
          }): "${owner}" and "${p.id}"`,
        };
      }
      seen.set(key, p.id);
    }
  }
  return null;
}

function findDependencyError(plugins: ReadonlyArray<PluginDescriptor>): AssemblyError | null {
  const byId = new Map(plugins.map((p) => [p.id, p]));
  for (const p of plugins) {
    for (const depId of p.dependsOn) {
      const dep = byId.get(depId);
      if (dep === undefined) {
        return {
          message: `plugin "${p.id}" depends on missing plugin "${depId}"`,
        };
      }
      if (stageIndex(dep.stage) > stageIndex(p.stage)) {
        return {
          message: `plugin "${p.id}" (stage "${p.stage}") depends on "${depId}" (stage "${dep.stage}") which runs in a later stage — order violation`,
        };
      }
    }
  }
  return null;
}

function orderByStage(plugins: ReadonlyArray<PluginDescriptor>): ReadonlyArray<PluginDescriptor> {
  return [...plugins].sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage));
}

function stageIndex(stage: PipelineStage): number {
  return PIPELINE_STAGES.indexOf(stage);
}
